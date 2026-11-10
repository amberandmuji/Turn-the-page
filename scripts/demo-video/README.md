# Demo video

`make.sh` rebuilds `demo/turn-the-page-demo.mp4` (10 s, 1920×1080, with sound) and `demo/turn-the-page-demo.gif` (960 px, for the README or a landing page).

- The book is an original short story written for the demo (`book.html`, printed to `demo/The-Lighthouse-at-Hollow-Bay.pdf`), so there is no copyrighted text. Free to share.
- The reader is the real app from this repo. Only the camera is faked: `hand.js` draws a hand into a fake camera stream and `vision-stub.mjs` stands in for MediaPipe, returning the scripted hand's landmarks. The swipe detector, the gesture sign, the corner-curl flip and the camera window all run as normal.
- `overlay.js` adds the big hand and the closing title, for viewers only.
- `sound.py` is a copy of the paper page-turn sound from `js/feedback.js`, placed at each turn.
