# SpotifySTL

[![test](https://github.com/amoham42/spotifySTL/actions/workflows/test.yml/badge.svg)](https://github.com/amoham42/spotifySTL/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Live](https://img.shields.io/badge/try_it-amoham42.github.io%2FspotifySTL-1ed760)](https://amoham42.github.io/spotifySTL/)

Turn any Spotify song, album, playlist, artist or podcast into a **3D-printable keychain** carrying its scannable Spotify Code. Everything runs in the browser.

**[Try it →](https://amoham42.github.io/spotifySTL/)**

![SpotifySTL](docs/screenshot.jpg)

## Use it

1. In Spotify, choose **Share → Copy link**, paste the link into the box, and press **Make**.
2. Adjust the length, base thickness and code height. The preview updates live.
3. Choose **Download STL** for one file, or **Two-colour files** for the base and the code as separate bodies (for multi-material printers).
4. To print two colours on a single-nozzle printer, add a filament change at the height shown under the buttons, which is the base thickness (2 mm by default). The rim and the ring around the hole are as tall as the code, so they print in the second colour too.

Point the Spotify app's camera (Search → camera icon) at the printed code and it opens your song.

A keychain can be shared by URL. The page keeps the Spotify URI in its address, as in `…/spotifySTL/#spotify:track:…`.

## How it works

- **The code.** Spotify serves every code as an SVG from its public scannables endpoint: one rounded rectangle per bar, plus the logo. The page fetches that SVG and keeps the dark shapes, recognised by their fill colour rather than their position in the file. It maps them from SVG units (y down) to millimetres (y up) and extrudes them with three.js.
- **The base.** A tray with a raised rim and a large key-ring hole at one rounded end, with a raised ring around the hole. The code stands on the tray floor, its top flush with the rim, which protects the bars from wear. The proportions come from the original hand-modelled keychain (72 × 15 × 3 mm with a 12 mm hole) and scale with the length you choose.
- **Print-ready geometry.** The model is built in millimetres with Z up, the way slicers expect. The code and the rim sink 0.05 mm into the floor so the bodies fuse cleanly. Shapes are rebuilt point by point instead of mirrored with a negative scale, which would turn the STL inside out.
- **Links.** `spotify.js` accepts `open.spotify.com` links, including `?si=` tracking, `/intl-xx/` locales and `/embed/` paths, as well as `spotify:` URIs. It is covered by unit tests.

No build step. `index.html`, `main.css`, `keychain.js` and `spotify.js` are the whole app, and three.js loads from a CDN through an import map.

## Develop

```sh
npm start     # serves the folder on http://localhost:8080
npm test      # link-parsing unit tests (Node 20+)
```

## License

[MIT](LICENSE). Spotify and Spotify Codes are trademarks of Spotify AB; this project is not affiliated with Spotify.
