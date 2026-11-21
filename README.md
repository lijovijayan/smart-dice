# Smart Dice

A small box that knows which face is up. A Seeed XIAO nRF52840 Sense reads its
built-in motion sensor, works out the upper face from gravity, and sends it over
Bluetooth LE to a browser dashboard that shows a matching 3D cube.

## Layout

```
smart-dice/
├── deploy.py                            Builds, then deploys with GitHub Actions
├── .github/workflows/deploy.yml         Builds web/ and publishes it to GitHub Pages
├── firmware/smart_dice/smart_dice.ino   Arduino sketch for the board
├── web/                                 Browser dashboard (plain HTML + JavaScript)
│   ├── build.py                         Bundles a page you can double-click
│   ├── index.html                       Page markup (source)
│   ├── src/
│   │   ├── main.js                      Entry point: wires everything together
│   │   ├── dice/                        Logic: faces, packet decoding, Bluetooth, state, rolls
│   │   ├── scene/                       Three.js die: lighting, spring motion, camera, textures
│   │   ├── ui/                          Header and side panel
│   │   └── styles/main.css
│   ├── vendor/three/                    Three.js, copied in so nothing needs installing
│   └── tests/                           Browser test page for the pure logic
└── docs/protocol.md                     Bluetooth service and packet format
```

## Status

The web app runs in demo mode. The firmware has not been compiled or run on
hardware yet.

## Web app

The source is split into modules, and browsers will not load those when you
double-click `index.html`. Run the build script once. It needs Python 3, which
ships with macOS and is a normal install on Windows (`python.org` or the
Microsoft Store). It does not install anything else.

```
cd web
python3 build.py
```

On Windows use `py build.py`. The script writes `web/build/` and opens
`web/build/index.html`. After that you can double-click that file. Use Chrome
or Edge. Web Bluetooth does not work in Safari, Firefox, or any iPhone browser.

Without a board, press keys 1 to 6 to move the cube (demo mode).

The logic tests still need a local server, because they load modules:

```
cd web
python3 -m http.server 8000
```

Open http://localhost:8000/tests/ while it is running. Every line should say PASS.

Two rules keep the bundle working, and `build.py` stops with a clear message if
you break them: keep each `import` on one line, and do not give two modules a
top-level name in common (the bundle puts them all in one scope).

## Deploy to GitHub Pages

The workflow in `.github/workflows/deploy.yml` builds `web/` with `build.py` and
publishes `web/build` to GitHub Pages. It runs on every push to `main` that
changes `web/`, and you can also start it by hand from the Actions tab.

To deploy from your machine:

```
python3 deploy.py
```

It builds locally to catch errors, checks that your work is committed and
pushed (GitHub builds what is pushed, not what is on your disk), turns on Pages
for the repo if needed, starts the workflow, and waits for it to finish. Use
`--no-watch` to return right away, or `--allow-unpushed` to deploy the last
pushed version anyway. It needs git and the GitHub CLI (`gh`).

First time only, create the repo and push (this folder is not a git repo yet):

```
git init
git add -A
git commit -m "Initial commit"
git branch -M main
gh auth login
gh repo create smart-dice --public --source . --push
```

GitHub Pages is free for public repos. The site is public too, and it is served
over HTTPS, which Web Bluetooth needs.

## Firmware

1. Install Arduino IDE 2.
2. In Preferences, add this Boards Manager URL:
   `https://files.seeedstudio.com/arduino/package_seeeduino_boards_index.json`
3. In Boards Manager, install **Seeed nRF52 mbed-enabled Boards**.
4. In Library Manager, install **ArduinoBLE** and **Seeed Arduino LSM6DS3**.
5. Open `firmware/smart_dice/smart_dice.ino`, select
   **Seeed XIAO BLE Sense - nRF52840**, and upload over USB-C.
6. Open Serial Monitor at 115200 baud. Turning the board should print the face.

Check these steps against Seeed's XIAO nRF52840 Sense guide when you first set
up, since package names change between releases:
https://wiki.seeedstudio.com/XIAO_BLE/

## Build order

1. Board on USB only: upload the firmware, watch Serial Monitor.
2. Connect from the dashboard and confirm the cube follows the board.
3. Add the battery.
4. Print the box and label the faces to match.

## Face numbering

Opposite faces add up to 7, like a real die. The board's top side is face 1.

| Axis pointing up | Face |
|------------------|------|
| +Z (board top)   | 1    |
| +X               | 2    |
| +Y               | 3    |
| -Y               | 4    |
| -X               | 5    |
| -Z (board bottom)| 6    |
