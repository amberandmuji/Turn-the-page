// One-click updates for the unpacked extension.
//
// Chrome doesn't update extensions loaded with "Load unpacked", so the
// extension updates its own folder instead: it compares its files.json with
// the newest one on GitHub, downloads the files that changed, writes them into
// the folder (with the reader's permission, through Chrome's folder access)
// and reloads itself.

const REPO = 'amberandmuji/Turn-the-page';
const BRANCH = 'dev';
const DIR = 'kindle-extension';

const rawUrl = (sha, path) => `https://raw.githubusercontent.com/${REPO}/${sha}/${DIR}/${path}`;

export async function installedList() {
  const res = await fetch(chrome.runtime.getURL('files.json'), { cache: 'no-store' });
  return res.json();
}

// The newest version on GitHub, pinned to one commit so the files all match.
export async function latestList() {
  const res = await fetch(`https://api.github.com/repos/${REPO}/commits/${BRANCH}`, {
    headers: { Accept: 'application/vnd.github.sha' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  const sha = (await res.text()).trim();
  const list = await (await fetch(rawUrl(sha, 'files.json'))).json();
  return { sha, list };
}

export async function checkForUpdate() {
  const [installed, latest] = await Promise.all([installedList(), latestList()]);
  const changed = Object.keys(latest.list.files).filter((p) => latest.list.files[p] !== installed.files[p]);
  const removed = Object.keys(installed.files).filter((p) => !(p in latest.list.files));
  return {
    installed: installed.version,
    latest: latest.list.version,
    sha: latest.sha,
    list: latest.list,
    changed,
    removed,
    available: changed.length + removed.length > 0,
  };
}

// --- the extension's folder ------------------------------------------------------

function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('turn-the-page', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('handles');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idb(mode, fn) {
  const conn = await db();
  return new Promise((resolve, reject) => {
    const tx = conn.transaction('handles', mode);
    const req = fn(tx.objectStore('handles'));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
  });
}

export const savedFolder = () => idb('readonly', (s) => s.get('extension-folder')).catch(() => null);
const saveFolder = (handle) => idb('readwrite', (s) => s.put(handle, 'extension-folder'));

async function isThisExtension(dir) {
  try {
    const file = await (await dir.getFileHandle('manifest.json')).getFile();
    return JSON.parse(await file.text()).name === chrome.runtime.getManifest().name;
  } catch {
    return false;
  }
}

// Asks for the folder the first time, then reuses it. Must run from a click.
export async function getFolder() {
  let dir = await savedFolder();
  if (dir && (await dir.requestPermission({ mode: 'readwrite' })) === 'granted' && await isThisExtension(dir)) {
    return dir;
  }
  dir = await window.showDirectoryPicker({ id: 'turn-the-page-extension', mode: 'readwrite' });
  if (!(await isThisExtension(dir))) {
    // They may have picked the folder that holds it.
    try {
      const inner = await dir.getDirectoryHandle(DIR);
      if (await isThisExtension(inner)) dir = inner;
    } catch {
      // fall through
    }
  }
  if (!(await isThisExtension(dir))) {
    throw new Error('wrong-folder');
  }
  await saveFolder(dir);
  return dir;
}

async function sha256(buffer) {
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function fileHandle(dir, path, create) {
  const parts = path.split('/');
  const name = parts.pop();
  for (const part of parts) dir = await dir.getDirectoryHandle(part, { create });
  return { dir, name };
}

// Downloads everything first and checks it, so a failed download never leaves
// the extension half-updated. onProgress(done, total) reports downloads.
export async function applyUpdate(dir, update, onProgress = () => {}) {
  const downloads = [];
  let done = 0;
  for (const path of update.changed) {
    const res = await fetch(rawUrl(update.sha, path));
    if (!res.ok) throw new Error(`Couldn't download ${path}`);
    const data = await res.arrayBuffer();
    if ((await sha256(data)) !== update.list.files[path]) throw new Error(`${path} didn't download correctly`);
    downloads.push({ path, data });
    onProgress(++done, update.changed.length);
  }
  for (const { path, data } of downloads) {
    const { dir: folder, name } = await fileHandle(dir, path, true);
    const writable = await (await folder.getFileHandle(name, { create: true })).createWritable();
    await writable.write(data);
    await writable.close();
  }
  for (const path of update.removed) {
    try {
      const { dir: folder, name } = await fileHandle(dir, path, false);
      await folder.removeEntry(name);
    } catch {
      // Already gone.
    }
  }
  // Last, so an interrupted update is retried next time.
  const { name } = await fileHandle(dir, 'files.json', false);
  const writable = await (await dir.getFileHandle(name, { create: true })).createWritable();
  await writable.write(`${JSON.stringify(update.list, null, 2)}\n`);
  await writable.close();
}
