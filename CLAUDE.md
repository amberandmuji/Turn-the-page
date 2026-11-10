# Turn the page

Two tools share one gesture engine:
- the PDF reader web app (`index.html`, `css/`, `js/`), published by GitHub Pages;
- the Kindle Cloud Reader Chrome extension (`kindle-extension/`).

## Rules

- **Keep the two tools in step.** Any change to one (gestures, the camera window, feedback, settings, behaviour) is made in the other too, in the same change, unless it only makes sense for one of them. Sean asked for this on 2026-11-10.
- Shared code lives in `js/` and is copied into `kindle-extension/shared/`. Edit the originals, then run `npm run sync:extension`. That also rewrites `kindle-extension/files.json`, which the extension's Update button relies on, so run it after any change in `kindle-extension/` too. `npm test` fails if either is out of date.
- New work goes to the `dev` branch (preview site at `/preview/`, and what the extension's Update button installs). `main` only changes when Sean approves.
- Commits are authored as "Amber" <179844639+amberandmuji@users.noreply.github.com>.
- Everything runs on the user's device. Nothing is uploaded.
