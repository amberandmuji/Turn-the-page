# Turn the page

Read hands-free. Swipe your hand in the air in front of your webcam and the page turns, with nothing to touch and nothing uploaded.

There are two tools that share one gesture engine:

- **The PDF reader**, a web app: https://amberandmuji.github.io/Turn-the-page/
- **Turn the page for Kindle**, a Chrome extension for Kindle Cloud Reader (read.amazon.com).

Built by Amber.

## Gestures

Both tools understand the same gestures. Sit about an arm's length (around 70 cm) from the camera, with your hand in good light.

| Gesture | What it does |
| --- | --- |
| Swipe right to left | Next page |
| Swipe left to right | Previous page |
| Hold your hand still, then swipe down | Fold the camera window into a small pill |
| Hold your hand still, then swipe up | Open the camera window again |
| Hold a fist for about a second | Stop gestures. The camera turns off completely |
| Pinch (thumb and index finger together) and move your hand | Drag a zoomed-in page around (PDF reader only) |

You can swap the swipe direction in settings if left to right feels more natural for "next".

To start again after a fist, click **Start gestures** or press **G** in the reader (**Alt+G** in Kindle). The camera is never left on while you're not using it: it also turns off when you stop gestures, switch tabs or close the page.

While you use it, the tools tell you what they saw:

- a small glass sign in the middle of the page shows each gesture ("Next page", "Keep holding to pause" with a filling ring, and so on);
- a label shows which way a swipe was read;
- a warning appears when the camera can't see your hand: too dark, your hand left the picture, or something is moving but no hand is found;
- a soft paper sound plays on each turn (volume in settings).

## The PDF reader

Open https://amberandmuji.github.io/Turn-the-page/ in Chrome, then:

1. Click **Open PDF**, or drop a PDF onto the page. Books stay on your computer.
2. Click **Start gestures**. Chrome asks to use the camera: click **Allow**. (If you blocked it by mistake, click the camera icon at the right of the address bar, choose **Always allow**, and reload.)
3. Swipe to turn pages. The first time, a short how-to shows the gestures. Open it again with the **?** button.

### Features

- **Two-page spread or single page.** Narrow windows always show one page.
- **Page-turn animation.** The page curls up from its corner and turns over like paper. You can turn it off in settings, and it's skipped if your computer is set to reduce motion.
- **Remembers your place.** Each book reopens at the page you left it on.
- **Recent books.** The arrow next to **Open PDF** lists the last 8 books you opened, so they reopen in one click. Copies are kept in this browser only. Turn off **Keep recent books** in settings to stop saving them.
- **Contents.** The button at the far left opens the book's table of contents as a side panel next to the pages, and lets you jump to any page number.
- **Zoom.** Use the + and − buttons at the bottom right, Ctrl + scroll, or the + / − / 0 keys. When zoomed in, a swipe first scrolls through the page, and turns the page once you reach its edge. Pinch and drag to move the page by hand. When you let go, it settles to show a whole page, and a clear sideways drag moves to the page on that side.
- **Full screen.** The button at the bottom right, or the F key. The toolbars hide until you move the mouse.
- **Camera window.** A small preview of what the camera sees, with your hand drawn on it. Fold it with its button or by swiping down.

### Settings (gear icon)

Swipe sensitivity, which way is "next", camera preview, single or two pages, keep recent books, sound volume and the page-turn animation. Settings are remembered in this browser.

### Keyboard

| Key | Action |
| --- | --- |
| → , Page Down, Space | Next page |
| ← , Page Up | Previous page |
| G | Start or stop gestures |
| C | Open or close the contents |
| + / − / 0 | Zoom in, zoom out, back to fit |
| F | Full screen |

## Turn the page for Kindle (Chrome extension)

Turns pages in Kindle Cloud Reader with the same gestures. It isn't in the Chrome Web Store, so it's installed from this repository.

### Install it in Chrome

1. Download the code: https://github.com/amberandmuji/Turn-the-page/archive/refs/heads/main.zip
2. Unzip it, and move the unzipped folder somewhere permanent, such as your Documents folder. Chrome runs the extension from this folder, so don't delete or move it afterwards.
3. In Chrome, go to `chrome://extensions` and turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the `kindle-extension` folder inside the unzipped folder.
5. Click the puzzle-piece icon in Chrome's toolbar and pin **Turn the page for Kindle**, so its icon is always visible.

### Use it

1. Open a book at https://read.amazon.com and sign in to Amazon as usual.
2. Click the extension's icon and **Start gestures**, or press **Alt+G** on the Kindle tab.
3. The first time, a tab opens asking for the camera. Click **Allow**. It closes itself and gestures start.
4. Swipe to turn pages. A card in the bottom-right corner shows your hand. Click its arrow, or swipe down, to fold it into a small pill.
5. Hold a fist to stop. The camera turns off.

The extension's menu has the same settings as the reader: swipe sensitivity, which way is "next", sound volume and the camera preview. If pages don't turn, use **Check page turning** in the menu. If it says nothing changed, click once inside the book and try again.

### Update it

Click the extension's icon. When a new version is out, the bottom of the menu says **Update available**. Click it, then **Update now**. The first time, Chrome asks you to choose the `kindle-extension` folder you loaded and to allow changes to it. After that it's one click: the extension downloads only the changed files, restarts, and reloads any open Kindle tabs. The Update button follows the `dev` branch, so it gets new versions as soon as they're ready to try.

You can also update by hand: download the zip again, replace the old folder, and click the reload arrow on the extension's card in `chrome://extensions`.

More detail on how the extension works is in [kindle-extension/README.md](kindle-extension/README.md).

## Privacy

Everything runs on your computer. Hand tracking uses Google's MediaPipe gesture recogniser, and the model and its code are served with the tools, not fetched from elsewhere. No video, pictures or books are uploaded anywhere. The camera is off until you start gestures, and turns off when you make a fist, stop, switch tabs or close the page.

## For developers

### Run it locally

The camera only works over `https://` or on `localhost`, so serve the folder instead of opening the file directly:

```sh
npm start                # serves on http://localhost:8000
npm test                 # gesture, hand-warning, pinch and extension tests
npm run sync:extension   # copies the shared code into the Kindle extension
```

### Project layout

| Path | What it does |
| --- | --- |
| `index.html`, `css/style.css` | The reader's page and styles |
| `js/app.js` | Wires the reader, camera, gestures, settings and feedback together |
| `js/reader.js` | Renders PDFs with PDF.js: spread, zoom, contents, saved page |
| `js/library.js` | Recent books, stored in the browser (IndexedDB) |
| `js/flip.js` | The corner-curl page-turn animation |
| `js/camera.js` | Webcam and MediaPipe hand tracking |
| `js/gestures.js` | Turns hand movement into next, previous, up, down and pause. Shared with the extension |
| `js/handwatch.js` | The "can't see your hand" warnings. Shared with the extension |
| `js/pinch.js` | Pinch to drag a zoomed page |
| `js/feedback.js` | Page-turn sound |
| `vendor/` | PDF.js 4.4.168 and MediaPipe Tasks Vision 0.10.14 (both Apache-2.0) |
| `models/gesture_recognizer.task` | MediaPipe's gesture recogniser model (Apache-2.0) |
| `kindle-extension/` | The Chrome extension for Kindle Cloud Reader |
| `scripts/sync-extension.mjs` | Copies the shared code into the extension and writes `kindle-extension/files.json` |

Shared code lives in `js/` and is copied into `kindle-extension/shared/`. Edit the originals, then run `npm run sync:extension`. `npm test` fails if the copies or `files.json` are out of date.

### Releases

New versions go to the `dev` branch first and show up at https://amberandmuji.github.io/Turn-the-page/preview/. Once they're approved, `dev` is merged into `main`, which updates the main site at https://amberandmuji.github.io/Turn-the-page/. Both are published by `.github/workflows/pages.yml`, so the repository's Pages source must be set to "GitHub Actions".
