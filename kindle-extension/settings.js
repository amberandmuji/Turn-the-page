// Settings and helpers shared by the extension's pages.

export const DEFAULT_SETTINGS = {
  sensitivity: 5,
  swap: false,     // true: left-to-right means next page
  volume: 0.7,     // page-turn sound, 0 = off (same default as the PDF reader)
  preview: true,   // hand preview card on the Kindle page
};

export async function loadSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...settings };
}

// Kindle Cloud Reader lives at read.amazon.com and its country versions.
export function isKindleUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && /^read\.amazon\.[a-z.]+$/.test(u.hostname);
  } catch {
    return false;
  }
}
