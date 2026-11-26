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
│   ├── index.html                       App shell only: header, tabs, empty page area
│   ├── src/
│   │   ├── main.js                      Entry point: creates the dice service, starts the shell
│   │   ├── app/                         Shell: tabs, router, header connection UI, page list
│   │   ├── dice/                        Dice service: Bluetooth, packet decoding, demo keys
│   │   ├── shared/                      Page contract, DOM helpers
│   │   ├── features/
│   │   │   ├── game/                    Snake & Ladder page: rules, board, view, CSS
│   │   │   └── dashboard/               3D cube page: panel, Three.js scene, CSS
│   │   └── styles/                      Base styles; index.css imports each page's CSS
│   ├── vendor/three/                    Three.js, copied in so nothing needs installing
│   └── tests/                           Browser test page, one suite per area
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

The app opens on the **Snake & Ladder** game (`#game`, the default page). Two to
four players take turns. Press Roll, roll the connected Smart Dice, or, without a
board, press keys 1 to 6 to choose the number (demo mode). You need an exact roll
to land on square 100. The **Dice** tab (`#dice`) is the 3D cube dashboard.

The game saves itself in the browser (`localStorage`, key `smart-dice:game`): player
positions, whose turn it is, the last roll, the move list, the undo history and the
player names. Close the tab or refresh and it picks up where you left off, even in
the middle of a move (the result is saved the moment the roll happens). Press
**New game** to start over (this also clears the undo history).
A save that is damaged or from another version is ignored. If the browser blocks
storage, the game still works and just does not remember.

**Undo** and **Redo** (under the Roll button) step back and forward through the moves,
up to 100 of them; they wait while a token is moving. Keyboard: Ctrl/Cmd + Z to undo,
Shift + Ctrl/Cmd + Z or Ctrl + Y to redo. Rolling after an undo replaces the undone
moves.

Each color (Red, Blue, Green, Amber) can be given a name: click the name in the Players
panel and type. It shows up in the turn, the move list and the winner message, and it
is kept for later games. Clear it to go back to the color's name.

The game has sound effects for rolls, hops, ladders, snake bites and wins. They are
made in the browser (Web Audio), so there are no audio files. Sound starts after
your first click or key press, because browsers block sound before that. Use the
**Sound** button in the Players panel to turn it off; the choice is remembered.

On the Dice tab, without a board, press keys 1 to 6 to move the cube (demo mode).

The logic tests still need a local server, because they load modules:

```
cd web
python3 -m http.server 8000
```

Open http://localhost:8000/tests/ while it is running. Every line should say PASS.

## Adding a page

Each page is a folder under `web/src/features/` that owns its markup, logic,
styles and tests. The shell knows nothing about individual pages.

1. Create `src/features/<name>/index.js` exporting a feature:

   ```js
   export const myFeature = {
     id: 'my-page',            // the URL hash: #my-page
     title: 'My page',         // tab label
     subtitle: 'Shown under the app title',
     mount(root, { dice }) {   // runs the first time the page is opened
       root.innerHTML = '...';
       const stop = dice.subscribe((snapshot) => { /* connection, face, rolls */ });
       return { setActive(active) { /* optional: page shown or hidden */ } };
     },
   };
   ```

2. Add it to the list in `src/app/features.js` (the first entry is the default page).
3. Add `@import '../features/<name>/<name>.css';` to `src/styles/index.css`.
4. Optional: add `tests/suites/<name>.js` and list it in `tests/run.js`.

Pages talk to the dice through the `dice` service (`subscribe` for state,
`onRoll` for rolls, `showDemoFace` for demo picks). They look up their own
elements with `data-ref` attributes and `refsOf(root, [...])` from
`src/shared/dom.js`, so two pages can never clash on ids or classes by accident.

`build.py` enforces who may import whom and stops with a clear message if you
break it:

- a page may import only its own folder, `src/dice/` and `src/shared/`, never
  another page or `src/app/`. Code two pages need goes in `src/shared/`;
- `src/dice/` and `src/shared/` import only each other;
- only `src/app/features.js` imports pages.

The bundler also needs each `import` on one line, written as
`import { a, b as c } from './file.js';`. Each module gets its own scope, so
top-level names never clash between files.

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
