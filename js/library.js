// Recent books. Browsers can't reopen a file from your computer by its path,
// so each book you open is copied into this browser's own storage
// (IndexedDB). It never leaves the device. Turning off "Keep recent books"
// in Settings deletes the copies.
const DB = 'turn-the-page';
const STORE = 'books';
export const MAX_BOOKS = 8;

let dbPromise = null;
function db() {
  dbPromise = dbPromise || new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, mode);
    const result = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(result?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const bookId = (file) => `${file.name}:${file.size}`;

// Newest first. Each entry: { id, name, size, openedAt, pageCount, cover }.
export async function listBooks() {
  try {
    const all = await run('readonly', (s) => s.getAll());
    return (all || []).sort((a, b) => b.openedAt - a.openedAt);
  } catch {
    return [];
  }
}

export async function getBook(id) {
  try {
    return await run('readonly', (s) => s.get(id));
  } catch {
    return null;
  }
}

// Saves (or refreshes) a book, then drops the oldest beyond MAX_BOOKS.
export async function rememberBook(file, details = {}) {
  try {
    navigator.storage?.persist?.().catch(() => {});
    const id = bookId(file);
    const old = await getBook(id);
    await run('readwrite', (s) => s.put({
      ...old,
      ...details,
      id,
      name: file.name,
      size: file.size,
      openedAt: Date.now(),
      data: old?.data || file,
    }));
    const extra = (await listBooks()).slice(MAX_BOOKS);
    if (extra.length) await run('readwrite', (s) => extra.forEach((b) => s.delete(b.id)));
    return true;
  } catch {
    return false; // storage full or blocked: the book still opens, it just isn't kept
  }
}

export async function updateBook(id, details) {
  try {
    const old = await getBook(id);
    if (old) await run('readwrite', (s) => s.put({ ...old, ...details }));
  } catch {
    // Not saved; nothing else to do.
  }
}

export async function forgetBook(id) {
  try {
    await run('readwrite', (s) => s.delete(id));
  } catch {
    // Already gone, or storage blocked.
  }
}

export async function forgetAll() {
  try {
    await run('readwrite', (s) => s.clear());
  } catch {
    // Storage blocked.
  }
}
