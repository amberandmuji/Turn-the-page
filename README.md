# Turn the page

Read PDFs hands-free. Open a book, start gestures, and swipe in the air in front of your webcam to turn the page.

Built by Amber.

## How to use

1. Open a PDF from your computer, or drop one onto the page.
2. Click **Start gestures** and allow camera access.
3. **Swipe right to left** for the next page, **left to right** for the previous page.
4. **Swipe down** to fold the camera window into a small pill, **swipe up** to open it again (hold your hand still for a moment first). The fold button on the window does the same.
5. **Hold a fist** for about a second to pause. The camera turns off completely. Click **Start gestures** or press **G** to resume.

Arrow keys, Page Up/Down and the space bar also turn pages.

Settings (gear icon): swipe sensitivity, two-page spread, sound on page turn, the page-turn animation, and the camera preview. The app remembers your settings and the last page of each book in this browser.

Works best in Chrome or Edge on a laptop or desktop, about an arm's length from the camera, with your hand in good light.

## Privacy

Everything runs in your browser. Hand tracking uses Google's MediaPipe gesture recogniser, and the model and its runtime are served from this site. No video, images or books are uploaded anywhere. The camera is off until you start gestures, and turns off when you pause, stop or switch tabs.

## Plan

**Goal.** A web tool that turns PDF pages by hand gesture using the built-in camera, for people reading on a monitor with their hands away from the keyboard, and for people reading while cooking or eating.

**Decisions.**

| Topic | Decision |
| --- | --- |
| Device | Laptop or desktop with a webcam first, phone later |
| Browser | Chrome and Edge |
| Privacy | Everything on the device, nothing uploaded |
| Books | PDFs opened from the reader's own computer |
| Turn pages | Swipe right-to-left for next, left-to-right for previous |
| Pause | Hold a fist; the camera turns off. Resume by restarting gestures |
| Distance | Tuned for about 70 cm |
| Hosting | GitHub Pages |

**Phase 1: the PDF reader** (this release)

1. Plain PDF reader with keyboard page turns
2. Camera preview and hand tracking
3. Swipe to turn, with a cooldown so one swipe turns one page
4. Hold a fist to pause and turn the camera off
5. Sound on each turn, and a sensitivity setting
6. Two-page spread and remembering the last page of each book
7. Testing across lighting, distance and either hand, plus a first-run how-to

**Phase 2: Kindle.** A Chrome extension, in `kindle-extension/`, that reuses the same gesture code to turn pages in Kindle Cloud Reader. See [kindle-extension/README.md](kindle-extension/README.md) to install it. A physical Kindle can't be controlled from a laptop alone, so it's out of scope.

## Run it locally

The camera only works over `https://` or on `localhost`, so serve the folder instead of opening the file directly:

```sh
npm start          # serves on http://localhost:8000
npm test           # runs the gesture detector and extension tests
npm run sync:extension   # copies the shared code into the Kindle extension
```

## Project layout

| Path | What it does |
| --- | --- |
| `index.html`, `css/style.css` | The page and its styles |
| `js/app.js` | Wires the reader, camera, gestures and settings together |
| `js/reader.js` | Renders PDFs with PDF.js, handles the spread and saved page |
| `js/camera.js` | Webcam and MediaPipe hand tracking |
| `js/gestures.js` | Turns hand movement into next, previous and pause. No browser code, so it can be tested and reused for Kindle |
| `js/feedback.js` | Page-turn sound |
| `vendor/` | PDF.js 4.4.168 (Apache-2.0) and MediaPipe Tasks Vision 0.10.14 (Apache-2.0) |
| `models/gesture_recognizer.task` | MediaPipe's gesture recogniser model (Apache-2.0) |
| `kindle-extension/` | The Chrome extension for Kindle Cloud Reader (phase 2) |
| `scripts/sync-extension.mjs` | Copies the shared code into the extension |

## Testing new versions

New versions go to the `dev` branch first and show up at https://amberandmuji.github.io/Turn-the-page/preview/ (marked "preview"). Once they work, `dev` is merged into `main`, which updates the main site at https://amberandmuji.github.io/Turn-the-page/. Both are published by `.github/workflows/pages.yml`, so the repo's Pages source must be set to "GitHub Actions".
