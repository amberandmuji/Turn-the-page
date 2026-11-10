# Demo video

`demo/turn-the-page-demo.mp4` (18 s, 1920×1080, with sound) and `demo/turn-the-page-demo.gif` (800 px) show the main features: swipe for the next page, swipe back, zoom in and pinch-and-drag, and a fist to pause.

Rebuild with `scripts/demo-video/make.sh swipes.mov pinch.mov`, giving it two screen recordings of the camera window (the source clips aren't kept in the repo).

- **The book** is an original short story written for the demo (`book.html`, printed to `demo/The-Lighthouse-at-Hollow-Bay.pdf`), so there is no copyrighted text.
- **The hand is real.** `extract.cjs` tracks the hand in every frame of the clips with the app's own MediaPipe model. `record.cjs` then runs the real reader with the camera swapped out: `vision-stub.mjs` replays those tracked hands, so the swipe detector, the pinch grab and the fist pause react just as they did live, and the clips themselves are shown in the camera window (`timeline.js` says which part of which clip plays when).
- `compose.py` adds the zoom-in/zoom-out camera moves, captions, and the title and end cards. `sound.py` is a copy of the page-turn sound from `js/feedback.js`.
