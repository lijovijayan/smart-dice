# Smart Dice

A small box that knows which face is up. A Seeed Studio XIAO nRF52840 Sense
reads its built-in motion sensor, works out the upper face from gravity, and
sends it over Bluetooth LE to a browser dashboard that shows a matching 3D cube.

There is no wiring. The board has the sensor and Bluetooth built in; the only
soldering is the optional battery.

## What you need

- Seeed Studio XIAO nRF52840 **Sense** (the plain nRF52840 has no motion sensor)
- USB-C cable that carries data, not a charge-only cable
- A computer with Chrome or Edge
- Optional: a 3.7 V single-cell LiPo battery and a soldering iron

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

Tested with Arduino IDE 2.3.6 and Seeed nRF52 mbed-enabled Boards 2.9.3 on macOS.

## Part 1: Firmware

### 1. Install the board package

1. Install [Arduino IDE 2](https://www.arduino.cc/en/software).
2. Open **Arduino IDE → Settings** and add this to
   **Additional boards manager URLs**:

   ```
   https://files.seeedstudio.com/arduino/package_seeeduino_boards_index.json
   ```

3. Open **Tools → Board → Boards Manager**, search `seeed nrf52`, and install
   **Seeed nRF52 mbed-enabled Boards**.

Seeed publishes two packages with nearly the same name. This project needs the
**mbed-enabled** one. The plain "Seeed nRF52 Boards" package does not work with
the ArduinoBLE library and fails with `undefined reference to HCITransport`.

### 2. Install the libraries

Open **Tools → Manage Libraries** and install:

- **ArduinoBLE** by Arduino
- **Seeed Arduino LSM6DS3** by Seeed Studio

Libraries with similar names (Arduino_LSM6DS3, SparkFun LSM6DS3) will not work.

### 3. Select the board and port

1. Plug the board in over USB-C.
2. Select **Tools → Board → Seeed nRF52 mbed-enabled Boards** and pick the
   XIAO nRF52840 **Sense** entry (not "Plus"). Older package versions call it
   "Seeed XIAO BLE Sense - nRF52840".
3. Select the board under **Tools → Port** (on macOS, `/dev/cu.usbmodem…`).

Pick the board from the Tools menu, not the dropdown in the toolbar. The
dropdown does not show which package a board belongs to.

### 4. Upload

1. Open `firmware/smart_dice/smart_dice.ino`.
2. Close any open Serial Monitor, then click **Upload**.
3. Open **Tools → Serial Monitor** at 115200 baud. You should see:

   ```
   Smart Dice starting
   IMU ready
   SmartDice advertising, address xx:xx:xx:xx:xx:xx
   ```

4. Turn the board. Each change prints `Face: N`, and a face that holds still
   prints `Rolled: N`.

### What the board does

- **Serial Monitor:** face changes, finished rolls, and Bluetooth connects and
  disconnects are printed. Set `LOG_SAMPLES` to `true` in the sketch to print
  every reading. The board waits 2 seconds at start for the monitor to attach.
- **Heartbeat:** the built-in LED blinks once every 5 seconds to show the board
  is running.
- **Auto sleep:** after 60 seconds without movement, with no dashboard
  connected, the board sleeps. It checks for movement every half second and
  prints `Asleep` and `Awake`. Moving the die or connecting the dashboard wakes
  it. It keeps advertising while asleep. Set `AUTO_SLEEP_MS` to `0` to turn
  sleep off.

Check these steps against Seeed's XIAO nRF52840 Sense guide when you first set
up, since package names change between releases:
https://wiki.seeedstudio.com/XIAO_BLE/

## Part 2: Web dashboard

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

## Part 3: Connect

There is no pairing in the operating system's Bluetooth settings. The browser
connects directly.

1. Make sure the board is powered and advertising.
2. Click **Connect** in the dashboard.
3. Pick **SmartDice** in the browser popup and click **Pair**.
4. The cube follows the board.

If SmartDice is not in the popup:

- On macOS, allow Chrome under **System Settings → Privacy & Security →
  Bluetooth**, then restart Chrome.
- Press the board's reset button once and try again.
- Scan with the free nRF Connect phone app. If SmartDice shows there, the board
  is fine and the problem is on the computer.

## Part 4: Battery (optional)

1. Unplug USB.
2. On the underside of the board, find the pads marked **BAT+** and **BAT−**.
3. Solder the battery's red wire to BAT+ and black wire to BAT−.
4. Cover the joints so the wires cannot pull off or touch.

Notes:

- Check polarity before soldering. The board has no reverse-polarity protection.
- If you cut a connector off the battery, cut one wire at a time.
- The board charges the battery whenever USB-C is plugged in, at 50 mA by
  default. Use a cell rated for at least that charge current (50 mAh or
  larger), and do not enable the board's 100 mA mode with a small cell.
- There is no power switch. The board runs whenever a battery is attached. Add
  a slide switch on the red wire if you need one.

## Face numbering

Opposite faces add up to 7, like a real die. The board's top side is face 1.

| Axis pointing up  | Face |
|-------------------|------|
| +Z (board top)    | 1    |
| +X                | 2    |
| +Y                | 3    |
| -Y                | 4    |
| -X                | 5    |
| -Z (board bottom) | 6    |

A face is reported when one axis reads more than 0.8 g. It is marked stable
after holding for 300 ms. The Bluetooth packet format is in `docs/protocol.md`.

## Troubleshooting

**`LSM6DS3.h: No such file or directory`** or **`ArduinoBLE.h: No such file or
directory`**
The library is not installed. See step 2 of the firmware section.

**`undefined reference to HCITransport`**
The board is selected under the plain "Seeed nRF52 Boards" package. Select it
under **Seeed nRF52 mbed-enabled Boards**.

**`unable to find a matching CMSIS-DAP device`**
A different board (for example XIAO MG24) is selected. See step 3.

**`Resource busy` on upload**
Another program has the serial port open. Close Serial Monitor and Serial
Plotter in every Arduino IDE window, then upload again. On macOS,
`lsof | grep usbmodem` shows what is holding the port.

**Board does not appear as a port, or upload will not start**
Double-tap the reset button. The board appears as a USB drive. Select the port
again (its number may change) and upload.

**Board is not in the Bluetooth popup**
See the list under Part 3. Check the serial output first: if it shows
`SmartDice advertising`, the board is fine.

**macOS: `pyenv: python: command not found`**
The build runs a command called `python`. Set a default version, then restart
Arduino IDE:

```
pyenv global 3.11.7
```

**macOS: `Click will abort further execution because Python was configured to
use ASCII`**
The `adafruit-nrfutil` tool bundled with the Seeed package fails on recent
macOS. Replace it with a copy installed through pip, then restart Arduino IDE.
The original is kept as `adafruit-nrfutil.bak`.

```
pip install adafruit-nrfutil
for d in ~/Library/Arduino15/packages/Seeeduino/hardware/*/*/tools/adafruit-nrfutil/macos; do
  mv "$d/adafruit-nrfutil" "$d/adafruit-nrfutil.bak"
  cp "$(pyenv which adafruit-nrfutil)" "$d/adafruit-nrfutil"
done
```

Without pyenv, use `$(which adafruit-nrfutil)` in the `cp` line.

## Build order

1. Board on USB only: upload the firmware, watch Serial Monitor.
2. Connect from the dashboard and confirm the cube follows the board.
3. Add the battery.
4. Print the box and label the faces to match.

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
