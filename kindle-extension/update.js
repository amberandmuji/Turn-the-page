import { checkForUpdate, getFolder, applyUpdate, savedFolder } from './updates.js';

const $ = (id) => document.getElementById(id);
let update = null;

async function check() {
  try {
    update = await checkForUpdate();
  } catch {
    $('title').textContent = 'Couldn\'t check for updates';
    $('body').textContent = 'GitHub didn\'t answer. Check your internet connection and try again in a minute.';
    return;
  }
  if (!update.available) {
    $('title').textContent = 'You have the latest version';
    $('body').textContent = `Version ${update.installed}.`;
    return;
  }
  $('title').textContent = 'A new version is ready';
  const first = !(await savedFolder());
  $('body').textContent = first
    ? 'The first time, Chrome asks you to choose the kindle-extension folder you loaded, and to allow changes to it. After that, updating is one click.'
    : 'Chrome may ask you to confirm access to the extension folder.';
  $('go').hidden = false;
}

$('go').addEventListener('click', async () => {
  $('go').disabled = true;
  try {
    const dir = await getFolder();
    $('status').textContent = 'Downloading…';
    await applyUpdate(dir, update, (done, total) => {
      $('status').textContent = `Downloading ${done} of ${total} files…`;
    });
    $('status').textContent = 'Updated. Restarting the extension…';
    await chrome.storage.local.set({ justUpdated: update.latest });
    setTimeout(() => chrome.runtime.reload(), 400);
  } catch (err) {
    console.error(err);
    $('go').disabled = false;
    $('status').textContent = err.name === 'AbortError'
      ? 'No folder chosen. Click Update now to try again.'
      : err.message === 'wrong-folder'
        ? 'That folder isn\'t the extension. Choose the kindle-extension folder you loaded in chrome://extensions.'
        : `The update didn't finish (${err.message}). Click Update now to try again.`;
  }
});

check();
