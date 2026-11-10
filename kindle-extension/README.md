# Turn the page for Kindle

A Chrome extension that turns pages in Kindle Cloud Reader (read.amazon.com) when you swipe your hand in front of the webcam. It uses the same hand tracking and swipe detection as the PDF reader, and everything runs on your computer.

## Install

1. Download the code: https://github.com/amberandmuji/Turn-the-page/archive/refs/heads/main.zip
2. Unzip it and move the folder somewhere permanent, such as Documents. Chrome runs the extension from this folder, so don't delete or move it later.
3. In Chrome, go to `chrome://extensions` and turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the `kindle-extension` folder inside the unzipped folder.
5. Click the puzzle-piece icon in Chrome's toolbar and pin **Turn the page for Kindle**.

## Update

Click the extension's icon. When a new version is out, the bottom of the menu says **Update available**. Click it, then **Update now**. The first time, Chrome asks you to choose the `kindle-extension` folder you loaded and to allow changes to it; after that it's one click. The extension downloads the changed files from the `dev` branch on GitHub, writes them into its folder, restarts, and reloads any open Kindle tabs.

## Use

1. Open a book at https://read.amazon.com.
2. Click the extension's icon and **Start gestures**, or press **Alt+G** on the Kindle tab.
3. The first time, a tab opens asking for the camera. Click **Allow**. It closes itself and gestures start.
4. Swipe right to left for the next page, left to right for the previous one. A card in the bottom-right corner shows your hand. Click its arrow, or hold your hand still and swipe down, to fold it into a small pill so it doesn't cover the book. Swipe up (or click) to open it again. It stays folded until you open it.
5. Hold a fist for about a second to pause. The camera turns off. Press **Alt+G** or click **Start gestures** to resume.

Gestures also stop when you switch away from the Kindle tab or close it, so the camera is never on in the background.

If pages don't turn, use **Check page turning** in the extension's menu. If it says nothing changed, click once inside the book and try again.

## How it works

| File | What it does |
| --- | --- |
| `background.js` | Starts and stops gestures, and passes page turns to the Kindle tab |
| `offscreen.html`, `offscreen.js` | A hidden page that holds the camera and the hand tracker while gestures are on. Stopping closes it, which turns the camera off |
| `content.js` | Runs on the Kindle page: clicks Kindle's next or previous arrow (or presses the arrow key) and shows the corner card |
| `popup.html`, `popup.js` | The extension's menu: start and stop, and settings |
| `setup.html`, `setup.js` | Asks for camera permission the first time |
| `update.html`, `update.js`, `updates.js` | The Update button: compares `files.json` with the newest one on GitHub and writes the changed files into the extension's folder |
| `files.json` | Every file and its hash. Written by `npm run sync:extension`, which must run after any change here |
| `shared/` | Copies of the PDF reader's gesture code, MediaPipe and the model. Don't edit these here: change the originals and run `npm run sync:extension` |
