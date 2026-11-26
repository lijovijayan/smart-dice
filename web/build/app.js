(() => {
"use strict";

// --- dice/faces.js ---
// Face numbering shared by the 3D cube, the panel, and demo mode.
// Opposite faces add up to 7. Board top (+Z) is face 1.

const FACE_NUMBERS = Object.freeze([1, 2, 3, 4, 5, 6]);

/** Face numbers read from the board's upper-face byte. 0 means "no clear face". */
const NO_FACE = 0;

/** Accent color for each face. */
const FACE_COLORS = Object.freeze({
  1: '#4f7cff',
  2: '#ff5d5d',
  3: '#34c98b',
  4: '#2bc4c4',
  5: '#a877ff',
  6: '#f2a13a',
});

/** Color used when no face is known. */
const FACE_NEUTRAL_COLOR = '#8a96ab';

/** Gravity reading (in g, sensor axes) when each face is up. Used by demo mode. */
const FACE_GRAVITY = Object.freeze({
  1: [0, 0, 1],
  2: [1, 0, 0],
  3: [0, 1, 0],
  4: [0, -1, 0],
  5: [-1, 0, 0],
  6: [0, 0, -1],
});

/** Pip positions per face as [column, row] on a 3 by 3 grid (0 to 2). */
const FACE_PIPS = Object.freeze({
  1: [[1, 1]],
  2: [
    [0, 0],
    [2, 2],
  ],
  3: [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  4: [
    [0, 0],
    [2, 0],
    [0, 2],
    [2, 2],
  ],
  5: [
    [0, 0],
    [2, 0],
    [1, 1],
    [0, 2],
    [2, 2],
  ],
  6: [
    [0, 0],
    [2, 0],
    [0, 1],
    [2, 1],
    [0, 2],
    [2, 2],
  ],
});

/** True for 1 to 6. */
function isFaceNumber(value) {
  return FACE_NUMBERS.includes(value);
}

/** Maps a raw byte from the board to a face. Anything unknown becomes NO_FACE. */
function toFace(value) {
  return isFaceNumber(value) ? value : NO_FACE;
}

/** Accent color for a face, or the neutral color for NO_FACE. */
function faceColor(face) {
  return isFaceNumber(face) ? FACE_COLORS[face] : FACE_NEUTRAL_COLOR;
}

// --- dice/protocol.js ---
// Bluetooth UUIDs and the state packet layout.
// These must match firmware/smart_dice/smart_dice.ino (see docs/protocol.md).


const SERVICE_UUID = 'f0bd0001-2ae7-429a-8fe0-3aa48ebf8220';
const STATE_UUID = 'f0bd0002-2ae7-429a-8fe0-3aa48ebf8220';

const STATE_PACKET_SIZE = 8;
const STATE_PACKET_FULL_SIZE = 9;
const SLEEP_IN_OFF = 255;

const MILLI_G_PER_G = 1000;

/**
 * Decodes the little-endian state packet: 8 bytes, or 9 when the board also reports how
 * long until it goes to sleep. `sleepIn` is that time in seconds, or null when the board
 * does not report it or has auto sleep turned off.
 * @param {DataView} view
 * @returns {{ ax: number, ay: number, az: number, face: number, stable: boolean, sleepIn: number | null }}
 * @throws {RangeError} if the packet is shorter than STATE_PACKET_SIZE.
 */
function parseState(view) {
  if (view.byteLength < STATE_PACKET_SIZE) {
    throw new RangeError(
      `State packet must be ${STATE_PACKET_SIZE} bytes, got ${view.byteLength}`,
    );
  }
  const sleepIn = view.byteLength >= STATE_PACKET_FULL_SIZE ? view.getUint8(8) : SLEEP_IN_OFF;
  return {
    ax: view.getInt16(0, true) / MILLI_G_PER_G,
    ay: view.getInt16(2, true) / MILLI_G_PER_G,
    az: view.getInt16(4, true) / MILLI_G_PER_G,
    face: toFace(view.getUint8(6)),
    stable: view.getUint8(7) === 1,
    sleepIn: sleepIn === SLEEP_IN_OFF ? null : sleepIn,
  };
}

// --- dice/bluetooth.js ---
// Web Bluetooth link to the Smart Dice board.
// Must be started from a user gesture (a button click).


function isBluetoothSupported() {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

/** True when the person closed the device picker without choosing a board. */
function isPickerCancelled(error) {
  return error instanceof DOMException && error.name === 'NotFoundError';
}

/**
 * Opens the device picker, connects, and subscribes to state notifications.
 * @param {{ onState: (state: object) => void, onDisconnect: () => void }} handlers
 * @returns {Promise<{ name: string, disconnect: () => void }>}
 */
async function connect({ onState, onDisconnect }) {
  const device = await navigator.bluetooth.requestDevice({
    filters: [{ services: [SERVICE_UUID] }],
  });
  device.addEventListener('gattserverdisconnected', onDisconnect);

  const { gatt } = device;
  if (!gatt) throw new Error('This device has no GATT server');

  try {
    const server = await gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);
    const characteristic = await service.getCharacteristic(STATE_UUID);

    characteristic.addEventListener('characteristicvaluechanged', () => {
      if (!characteristic.value) return;
      try {
        onState(parseState(characteristic.value));
      } catch (error) {
        console.warn('Ignoring bad state packet', error);
      }
    });
    await characteristic.startNotifications();
  } catch (error) {
    // Do not leave a half-open connection behind.
    device.removeEventListener('gattserverdisconnected', onDisconnect);
    gatt.disconnect();
    throw error;
  }

  return {
    name: device.name ?? 'SmartDice',
    disconnect: () => {
      gatt.disconnect();
    },
  };
}

// --- dice/history.js ---
// Rules for what counts as a roll, and the list of recent rolls.


const MAX_ROLLS = 12;

/**
 * True when `next` is a newly settled face compared with `prev`:
 * the die just became stable, or it is stable on a different face.
 */
function isNewRoll(prev, next) {
  if (!next.stable || next.face === NO_FACE) return false;
  return !prev.stable || prev.face !== next.face;
}

/** Returns a new list with `face` first, keeping at most MAX_ROLLS entries. */
function addRoll(rolls, face) {
  return [face, ...rolls].slice(0, MAX_ROLLS);
}

// --- dice/controller.js ---
// Holds the live dice state and the Bluetooth connection.
// While nothing is connected, keys 1 to 6 (or the face buttons) act as a demo board.


const INITIAL_STATE = Object.freeze({ ax: 0, ay: 0, az: 1, face: 1, stable: false });

/**
 * @param {(snapshot: object) => void} onChange called with a fresh snapshot after every change.
 * @returns {{ toggle: () => Promise<void>, showDemoFace: (face: number) => void }}
 */
function createDiceController(onChange) {
  const supported = isBluetoothSupported();

  let state = INITIAL_STATE;
  let rolls = [];
  let deviceName = null;
  let busy = false;
  let error = null;
  let asleep = false;
  let leaving = false;
  let fresh = false;
  /** @type {{ name: string, disconnect: () => void } | null} */
  let link = null;

  function notify() {
    onChange({
      state,
      rolls,
      deviceName,
      connected: link !== null,
      busy,
      error,
      supported,
      asleep,
    });
  }

  function setState(next) {
    if (!fresh && isNewRoll(state, next)) rolls = addRoll(rolls, next.face);
    fresh = false;
    state = next;
    notify();
  }

  /** Demo mode: pretend the board settled on `face`. Ignored while connected. */
  function showDemoFace(face) {
    if (link || !isFaceNumber(face)) return;
    const [ax, ay, az] = FACE_GRAVITY[face];
    setState({ ax, ay, az, face, stable: true });
  }

  window.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    showDemoFace(Number(event.key));
  });

  async function toggle() {
    error = null;
    if (link) {
      leaving = true;
      link.disconnect();
      return;
    }

    busy = true;
    asleep = false;
    leaving = false;
    fresh = true;
    notify();
    try {
      link = await connect({
        onState: setState,
        onDisconnect: () => {
          asleep = !leaving && state.sleepIn === 0;
          leaving = false;
          link = null;
          deviceName = null;
          notify();
        },
      });
      deviceName = link.name;
    } catch (err) {
      if (!isPickerCancelled(err)) {
        const reason = err instanceof Error ? err.message : String(err);
        error = `Could not connect: ${reason}`;
      }
    } finally {
      if (!link) fresh = false;
      busy = false;
      notify();
    }
  }

  notify();
  return { toggle, showDemoFace };
}

// --- scene/motion.js ---
// Pure motion helpers for the die scene. No Three.js in here, so they are easy to test.

const MIN_GRAVITY_G = 0.35;
const HOP_GRAVITY = 26;
const HOP_RESTITUTION = 0.4;

/** Upward speed given to the die when a roll lands. */
const HOP_IMPULSE = 4.4;

/** Keeps `value` between `min` and `max`. */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Moves `current` toward `target`, the same way at any frame rate.
 * A higher `rate` gets there faster.
 */
function approach(current, target, dt, rate) {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

/**
 * Converts a sensor gravity reading (in g) to the "up" direction in scene space.
 * Sensor +X is scene +X, sensor +Z is scene +Y, and sensor +Y is scene -Z.
 * Returns null when the reading is too weak to trust (free fall) or not a number.
 * @returns {[number, number, number] | null}
 */
function sensorToSceneUp(ax, ay, az) {
  const length = Math.hypot(ax, ay, az);
  if (!(length >= MIN_GRAVITY_G)) return null;
  return [ax / length, az / length, -ay / length];
}

/**
 * One physics step of the landing hop: a small bounce that settles.
 * `y` is the height above rest and `vy` its speed.
 */
function stepHop({ y, vy }, dt) {
  let nextVy = vy - HOP_GRAVITY * dt;
  let nextY = y + nextVy * dt;
  if (nextY <= 0) {
    nextY = 0;
    const restSpeed = HOP_GRAVITY * dt * 2;
    nextVy = Math.abs(nextVy) > restSpeed ? -nextVy * HOP_RESTITUTION : 0;
  }
  return { y: nextY, vy: nextVy };
}

// --- scene/orbit.js ---
// Drag to turn the camera around the die, wheel to zoom, double-click to reset.


const ORBIT_HOME = Object.freeze({ azimuth: 0.65, elevation: 0.46, radius: 7.2 });
const ORBIT_TARGET_Y = -0.35;
const ORBIT_MIN_ELEVATION = 0.05;
const ORBIT_MAX_ELEVATION = 1.35;
const ORBIT_MIN_RADIUS = 4.2;
const ORBIT_MAX_RADIUS = 11;
const ORBIT_DRAG_SPEED = 0.008;
const ORBIT_ZOOM_SPEED = 0.0012;
const ORBIT_INERTIA_DECAY = 3.5;
const ORBIT_MAX_SPIN = 6;
const ORBIT_RETURN_RATE = 6;
const ORBIT_STALE_DRAG_MS = 80;

/**
 * @param {HTMLCanvasElement} canvas receives the pointer events
 * @param {THREE.PerspectiveCamera} camera moved on every update
 * @returns {{ update: (dt: number) => void, fit: (aspect: number) => void, dispose: () => void }}
 */
function createOrbit(canvas, camera) {
  let azimuth = ORBIT_HOME.azimuth;
  let elevation = ORBIT_HOME.elevation;
  let radius = ORBIT_HOME.radius;
  let spinAzimuth = 0;
  let spinElevation = 0;
  let fitScale = 1;
  let dragging = false;
  let homing = false;
  let lastX = 0;
  let lastY = 0;
  let lastTime = 0;

  canvas.style.touchAction = 'none';

  function onPointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    dragging = true;
    homing = false;
    lastX = event.clientX;
    lastY = event.clientY;
    lastTime = event.timeStamp;
    spinAzimuth = 0;
    spinElevation = 0;
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('dragging');
  }

  function onPointerMove(event) {
    if (!dragging) return;
    const seconds = Math.max((event.timeStamp - lastTime) / 1000, 1 / 240);
    const turnAzimuth = -(event.clientX - lastX) * ORBIT_DRAG_SPEED;
    const turnElevation = (event.clientY - lastY) * ORBIT_DRAG_SPEED;
    lastX = event.clientX;
    lastY = event.clientY;
    lastTime = event.timeStamp;
    azimuth += turnAzimuth;
    elevation = clamp(elevation + turnElevation, ORBIT_MIN_ELEVATION, ORBIT_MAX_ELEVATION);
    spinAzimuth = clamp(turnAzimuth / seconds, -ORBIT_MAX_SPIN, ORBIT_MAX_SPIN);
    spinElevation = clamp(turnElevation / seconds, -ORBIT_MAX_SPIN, ORBIT_MAX_SPIN);
  }

  function onPointerUp(event) {
    if (!dragging) return;
    dragging = false;
    canvas.classList.remove('dragging');
    if (event.timeStamp - lastTime > ORBIT_STALE_DRAG_MS) {
      spinAzimuth = 0;
      spinElevation = 0;
    }
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  }

  function onWheel(event) {
    event.preventDefault();
    homing = false;
    radius = clamp(
      radius * Math.exp(event.deltaY * ORBIT_ZOOM_SPEED),
      ORBIT_MIN_RADIUS,
      ORBIT_MAX_RADIUS,
    );
  }

  function onDoubleClick() {
    homing = true;
    spinAzimuth = 0;
    spinElevation = 0;
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('dblclick', onDoubleClick);

  function update(dt) {
    if (!dragging) {
      azimuth += spinAzimuth * dt;
      elevation = clamp(
        elevation + spinElevation * dt,
        ORBIT_MIN_ELEVATION,
        ORBIT_MAX_ELEVATION,
      );
      const decay = Math.exp(-ORBIT_INERTIA_DECAY * dt);
      spinAzimuth *= decay;
      spinElevation *= decay;
    }

    if (homing) {
      const behind = ORBIT_HOME.azimuth - azimuth;
      const shortest = Math.atan2(Math.sin(behind), Math.cos(behind));
      azimuth = approach(azimuth, azimuth + shortest, dt, ORBIT_RETURN_RATE);
      elevation = approach(elevation, ORBIT_HOME.elevation, dt, ORBIT_RETURN_RATE);
      radius = approach(radius, ORBIT_HOME.radius, dt, ORBIT_RETURN_RATE);
      if (Math.abs(shortest) < 0.002 && Math.abs(elevation - ORBIT_HOME.elevation) < 0.002) {
        homing = false;
      }
    }

    const distance = radius * fitScale;
    camera.position.set(
      distance * Math.cos(elevation) * Math.sin(azimuth),
      ORBIT_TARGET_Y + distance * Math.sin(elevation),
      distance * Math.cos(elevation) * Math.cos(azimuth),
    );
    camera.lookAt(0, ORBIT_TARGET_Y, 0);
  }

  /** Pulls the camera back on tall, narrow screens so the die is never cut off. */
  function fit(aspect) {
    fitScale = Math.max(1, 1.05 / aspect);
  }

  function dispose() {
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('dblclick', onDoubleClick);
  }

  return { update, fit, dispose };
}

// --- scene/textures.js ---
/* global THREE */


const TEXTURE_SIZE = 512;
const PIP_EDGE = 0.25;
const PIP_STEP = 0.25;
const PIP_RADIUS = 0.075;
const LONE_PIP_RADIUS = 0.115;
const FRAME_INSET = 0.09;
const FRAME_RADIUS = 0.12;
const MAX_ANISOTROPY = 8;
const GRADIENT_SIZE = 256;

function drawPip(ctx, x, y, radius, color) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = radius * 0.9;
  const fill = ctx.createRadialGradient(
    x - radius * 0.3,
    y - radius * 0.3,
    radius * 0.1,
    x,
    y,
    radius,
  );
  fill.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
  fill.addColorStop(0.45, color);
  fill.addColorStop(1, color);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Draws one die face: dark glass with glowing pips in the face color.
 * The same texture is used for color and emission, so only the pips glow.
 * @param {1|2|3|4|5|6} face
 * @returns {THREE.CanvasTexture}
 */
function createFaceTexture(face) {
  const size = TEXTURE_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available');

  const color = FACE_COLORS[face];

  const body = ctx.createLinearGradient(0, 0, size, size);
  body.addColorStop(0, '#182033');
  body.addColorStop(1, '#0c111b');
  ctx.fillStyle = body;
  ctx.fillRect(0, 0, size, size);

  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(
    size * FRAME_INSET,
    size * FRAME_INSET,
    size * (1 - FRAME_INSET * 2),
    size * (1 - FRAME_INSET * 2),
    size * FRAME_RADIUS,
  );
  ctx.stroke();
  ctx.globalAlpha = 1;

  const pips = FACE_PIPS[face];
  const radius = (pips.length === 1 ? LONE_PIP_RADIUS : PIP_RADIUS) * size;
  for (const [column, row] of pips) {
    drawPip(ctx, size * (PIP_EDGE + PIP_STEP * column), size * (PIP_EDGE + PIP_STEP * row), radius, color);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = MAX_ANISOTROPY;
  return texture;
}

/**
 * A soft round fade, used for the floor shadow and glow.
 * @param {string} rgb color as "r, g, b", for example "255, 255, 255"
 * @param {number} peakAlpha opacity at the center, 0 to 1
 * @returns {THREE.CanvasTexture}
 */
function createRadialTexture(rgb, peakAlpha) {
  const canvas = document.createElement('canvas');
  canvas.width = GRADIENT_SIZE;
  canvas.height = GRADIENT_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available');

  const half = GRADIENT_SIZE / 2;
  const fade = ctx.createRadialGradient(half, half, 0, half, half, half);
  fade.addColorStop(0, `rgba(${rgb}, ${peakAlpha})`);
  fade.addColorStop(0.35, `rgba(${rgb}, ${peakAlpha * 0.55})`);
  fade.addColorStop(0.7, `rgba(${rgb}, ${peakAlpha * 0.14})`);
  fade.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, GRADIENT_SIZE, GRADIENT_SIZE);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// --- scene/cube.js ---
/* global THREE */

// The 3D die. It follows the board's tilt on a spring, snaps to the reported face
// once the board is still, hops when a roll lands, and glows in the face color.


// BoxGeometry material order is +X, -X, +Y, -Y, +Z, -Z.
const MATERIAL_ORDER = [2, 5, 1, 6, 4, 3];

// The up direction (in scene space) that each face points along on the cube.
const FACE_NORMALS = Object.fromEntries(
  FACE_NUMBERS.map((face) => [face, new THREE.Vector3(...sensorToSceneUp(...FACE_GRAVITY[face]))]),
);

const UP = new THREE.Vector3(0, 1, 0);

const DIE_SIZE = 2;
const DIE_ROUNDNESS = 0.16;
const GROUND_Y = -1.85;
const MAX_PIXEL_RATIO = 2;
const MAX_FRAME_SECONDS = 1 / 30;

const SPIN_STIFFNESS = 120;
const SPIN_DAMPING = 13;
const SPIN_MAX_SPEED = 18;
const SPIN_MIN_ANGLE = 1e-4;

const SHADOW_SIZE = 3.6;
const GLOW_SIZE = 6.4;
const GLOW_COLOR_RATE = 6;
const GLOW_FADE_RATE = 3;
const GLOW_BASE_OPACITY = 0.32;
const GLOW_KICK_OPACITY = 0.45;

const PIPS_ACTIVE = 1.25;
const PIPS_IDLE = 0.5;
const PIPS_NO_FACE = 0.6;
const PIPS_KICK = 0.6;
const PIPS_RATE = 8;

/**
 * Creates the die inside `container` (a positioned element).
 * @param {HTMLElement} container
 * @returns {{ setReading: (reading: object) => void, dispose: () => void, group: THREE.Group, die: THREE.Mesh }}
 *   `group` and `die` are exposed for tests and debugging.
 */
function createCube(container) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.toneMapping = THREE.NeutralToneMapping;
  const canvas = renderer.domElement;
  canvas.className = 'scene';
  container.prepend(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  const orbit = createOrbit(canvas, camera);

  // Soft studio reflections, built in code so no image files are needed.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new THREE.RoomEnvironment(), 0.04);
  pmrem.dispose();
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.8;

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
  keyLight.position.set(3, 6, 4);
  scene.add(keyLight);

  // Floor glow (face color) and contact shadow.
  const glowTexture = createRadialTexture('255, 255, 255', 1);
  const glowMaterial = new THREE.MeshBasicMaterial({
    map: glowTexture,
    color: new THREE.Color(faceColor(1)),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: GLOW_BASE_OPACITY,
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), glowMaterial);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = GROUND_Y - 0.01;
  glow.scale.setScalar(GLOW_SIZE);
  glow.renderOrder = 0;
  scene.add(glow);

  const shadowTexture = createRadialTexture('0, 0, 0', 0.8);
  const shadowMaterial = new THREE.MeshBasicMaterial({
    map: shadowTexture,
    transparent: true,
    depthWrite: false,
  });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMaterial);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = GROUND_Y;
  shadow.renderOrder = 1;
  scene.add(shadow);

  // The die. The group carries the hop and the gentle sway; the mesh carries the tilt.
  const group = new THREE.Group();
  scene.add(group);

  const geometry = new THREE.RoundedBoxGeometry(DIE_SIZE, DIE_SIZE, DIE_SIZE, 6, DIE_ROUNDNESS);
  const textures = MATERIAL_ORDER.map((face) => createFaceTexture(face));
  const materials = textures.map(
    (map) =>
      new THREE.MeshPhysicalMaterial({
        map,
        emissiveMap: map,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: PIPS_IDLE,
        roughness: 0.3,
        metalness: 0.05,
        clearcoat: 1,
        clearcoatRoughness: 0.15,
      }),
  );
  const die = new THREE.Mesh(geometry, materials);
  group.add(die);

  const reading = { face: 1, stable: false, ax: 0, ay: 0, az: 1 };
  const target = new THREE.Quaternion();
  const spin = new THREE.Vector3();
  const glowColorTarget = new THREE.Color(faceColor(reading.face));
  const pipLevels = materials.map(() => PIPS_IDLE);
  let hop = { y: 0, vy: 0 };
  let kick = 0;
  let clock = 0;

  // Scratch objects, reused every frame.
  const scratchUp = new THREE.Vector3();
  const scratchAxis = new THREE.Vector3();
  const scratchError = new THREE.Quaternion();
  const scratchInverse = new THREE.Quaternion();
  const scratchTurn = new THREE.Quaternion();

  function updateTarget() {
    if (reading.stable && reading.face !== NO_FACE) {
      target.setFromUnitVectors(FACE_NORMALS[reading.face], UP);
      return;
    }
    // Still moving: follow the real gravity direction from the sensor.
    const up = sensorToSceneUp(reading.ax, reading.ay, reading.az);
    if (up) target.setFromUnitVectors(scratchUp.set(...up), UP);
  }

  /** Feed the latest state: { face, stable, ax, ay, az }. */
  function setReading(next) {
    if (isNewRoll(reading, next) && !reduceMotion.matches) {
      hop = { y: hop.y, vy: HOP_IMPULSE };
      kick = 1;
    }
    Object.assign(reading, next);
    glowColorTarget.set(faceColor(reading.face));
    updateTarget();
  }

  updateTarget();
  die.quaternion.copy(target);

  function resize() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    orbit.fit(camera.aspect);
  }

  const observer = new ResizeObserver(resize);
  observer.observe(container);

  /** Spring the mesh toward the target pose. Overshoots a little, then settles. */
  function stepTilt(dt) {
    const damping = reduceMotion.matches ? 2 * Math.sqrt(SPIN_STIFFNESS) : SPIN_DAMPING;

    scratchError.copy(target).multiply(scratchInverse.copy(die.quaternion).invert());
    if (scratchError.w < 0) {
      scratchError.set(-scratchError.x, -scratchError.y, -scratchError.z, -scratchError.w);
    }
    const angle = 2 * Math.acos(Math.min(1, scratchError.w));
    if (angle > SPIN_MIN_ANGLE) {
      const sine = Math.sqrt(1 - scratchError.w * scratchError.w);
      scratchAxis.set(scratchError.x / sine, scratchError.y / sine, scratchError.z / sine);
      spin.addScaledVector(scratchAxis, angle * SPIN_STIFFNESS * dt);
    }

    spin.multiplyScalar(Math.exp(-damping * dt));
    spin.clampLength(0, SPIN_MAX_SPEED);

    const speed = spin.length();
    if (speed > 1e-5) {
      scratchTurn.setFromAxisAngle(scratchAxis.copy(spin).divideScalar(speed), speed * dt);
      die.quaternion.premultiply(scratchTurn).normalize();
    }
  }

  function stepFloating(dt) {
    clock += dt;
    if (reduceMotion.matches) {
      hop = { y: 0, vy: 0 };
      group.position.y = 0;
      group.rotation.y = 0;
      return 0;
    }
    hop = stepHop(hop, dt);
    const bob = Math.sin(clock * 1.6) * 0.05;
    group.position.y = hop.y + bob;
    // Turning around the vertical axis never changes which face is up.
    group.rotation.y = Math.sin(clock * 0.45) * 0.22;
    return Math.max(0, hop.y + bob * 0.5);
  }

  function stepGlow(dt, lift) {
    kick = approach(kick, 0, dt, GLOW_FADE_RATE);
    glowMaterial.color.lerp(glowColorTarget, 1 - Math.exp(-GLOW_COLOR_RATE * dt));
    glowMaterial.opacity = GLOW_BASE_OPACITY + GLOW_KICK_OPACITY * kick;
    glow.scale.setScalar(GLOW_SIZE * (1 + 0.12 * kick));

    shadow.scale.setScalar(SHADOW_SIZE * (1 - lift * 0.35));
    shadowMaterial.opacity = Math.max(0.3, 1 - lift * 1.2);

    materials.forEach((material, index) => {
      const face = MATERIAL_ORDER[index];
      let goal = reading.face === NO_FACE ? PIPS_NO_FACE : PIPS_IDLE;
      if (reading.face === face) goal = PIPS_ACTIVE + kick * PIPS_KICK;
      pipLevels[index] = approach(pipLevels[index], goal, dt, PIPS_RATE);
      material.emissiveIntensity = pipLevels[index];
    });
  }

  let frameId = 0;
  let lastTime = performance.now();

  function tick(now) {
    const dt = Math.min((now - lastTime) / 1000, MAX_FRAME_SECONDS);
    lastTime = now;

    stepTilt(dt);
    const lift = stepFloating(dt);
    stepGlow(dt, lift);
    orbit.update(dt);
    renderer.render(scene, camera);

    frameId = requestAnimationFrame(tick);
  }
  frameId = requestAnimationFrame(tick);

  function dispose() {
    cancelAnimationFrame(frameId);
    observer.disconnect();
    orbit.dispose();
    for (const material of materials) material.dispose();
    for (const texture of [...textures, glowTexture, shadowTexture]) texture.dispose();
    geometry.dispose();
    glow.geometry.dispose();
    shadow.geometry.dispose();
    glowMaterial.dispose();
    shadowMaterial.dispose();
    environment.dispose();
    renderer.dispose();
    canvas.remove();
  }

  return { setReading, dispose, group, die };
}

// --- dice/power.js ---
// What to tell the person about the board's power: awake, about to sleep, or asleep.

const SLEEP_WARNING_SECONDS = 20;

/** 45 -> "45 s", 120 -> "2 min", 185 -> "3 min 5 s". */
function formatDuration(seconds) {
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}

/**
 * @param {{ connected: boolean, asleep: boolean, sleepIn: number | null | undefined }} power
 * @returns {{ kind: 'awake' | 'soon' | 'asleep' | 'unknown', label: string, note: string }}
 */
function powerStatus({ connected, asleep, sleepIn }) {
  if (asleep) {
    return {
      kind: 'asleep',
      label: 'Asleep',
      note: 'The board went to sleep after no movement. Move it to wake it, then press Connect.',
    };
  }
  if (!connected) {
    return { kind: 'unknown', label: 'Not connected', note: 'Connect the board to see its power state.' };
  }
  if (sleepIn === null || sleepIn === undefined) {
    return { kind: 'unknown', label: 'Awake', note: 'Auto sleep is off, or this board does not report it.' };
  }
  if (sleepIn === 0) {
    return { kind: 'soon', label: 'Going to sleep', note: 'No movement for a while. Move the die to wake it.' };
  }
  if (sleepIn <= SLEEP_WARNING_SECONDS) {
    return {
      kind: 'soon',
      label: `Sleeping in ${formatDuration(sleepIn)}`,
      note: 'Move the die to keep it awake.',
    };
  }
  return {
    kind: 'awake',
    label: 'Awake',
    note: `Goes to sleep after ${formatDuration(sleepIn)} without movement.`,
  };
}

// --- ui/panel.js ---
// Keeps the header and side panel in sync with the dice state.


const UNSUPPORTED_MESSAGE =
  'This browser has no Web Bluetooth. Use Chrome or Edge on a laptop or Android phone.';
const HINT_DEMO = 'Press 1–6 or tap a face. Drag to rotate, double-click to reset.';
const HINT_LIVE = 'Drag to rotate, double-click to reset.';
const STABLE_LABELS = { stable: 'Stable', settling: 'Settling', moving: 'Moving' };

function stableKind({ face, stable }) {
  if (stable) return 'stable';
  return face === NO_FACE ? 'moving' : 'settling';
}

/** Draws a bar that grows left or right from the center. `value` is in g, shown up to ±1. */
function setAxisBar(bar, value) {
  const fraction = Math.min(Math.abs(value), 1) / 2;
  bar.style.width = `${fraction * 100}%`;
  bar.style.left = `${(value >= 0 ? 0.5 : 0.5 - fraction) * 100}%`;
}

/**
 * @param {Document} doc
 * @param {{ onToggle: () => void, onPickFace: (face: number) => void }} handlers
 * @returns {{ render: (snapshot: object) => void }}
 */
function bindPanel(doc, { onToggle, onPickFace }) {
  const el = (id) => {
    const node = doc.getElementById(id);
    if (!node) throw new Error(`Missing #${id} element`);
    return node;
  };

  const refs = {
    status: el('status'),
    statusText: el('status-text'),
    toggle: el('toggle'),
    mode: el('mode'),
    hint: el('hint'),
    face: el('face'),
    stable: el('stable'),
    faces: el('faces'),
    ax: el('ax'),
    ay: el('ay'),
    az: el('az'),
    barAx: el('bar-ax'),
    barAy: el('bar-ay'),
    barAz: el('bar-az'),
    power: el('power'),
    powerNote: el('power-note'),
    history: el('history'),
    historyEmpty: el('history-empty'),
    message: el('message'),
  };

  refs.toggle.addEventListener('click', onToggle);

  // One button per face. They act as the demo remote and mark the upper face.
  const chips = FACE_NUMBERS.map((face) => {
    const chip = doc.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = String(face);
    chip.style.setProperty('--c', faceColor(face));
    chip.setAttribute('aria-label', `Show face ${face}`);
    chip.addEventListener('click', () => {
      onPickFace(face);
    });
    refs.faces.append(chip);
    return chip;
  });

  let shownFace = null;
  let shownRolls = null;

  function renderRolls(rolls) {
    if (rolls === shownRolls) return;
    shownRolls = rolls;
    refs.history.replaceChildren(
      ...rolls.map((face) => {
        const roll = doc.createElement('span');
        roll.className = 'roll';
        roll.textContent = String(face);
        roll.style.setProperty('--c', faceColor(face));
        return roll;
      }),
    );
    refs.historyEmpty.hidden = rolls.length > 0;
  }

  function renderFace(face) {
    if (face === shownFace) return;
    shownFace = face;
    doc.documentElement.style.setProperty('--face', faceColor(face));
    refs.face.textContent = face === NO_FACE ? '–' : String(face);
    // Replay the pop animation.
    refs.face.classList.remove('pop');
    void refs.face.offsetWidth;
    refs.face.classList.add('pop');
  }

  function render({ state, rolls, deviceName, connected, busy, error, supported, asleep = false }) {
    refs.statusText.textContent = connected
      ? `Connected to ${deviceName ?? 'board'}`
      : busy
        ? 'Connecting…'
        : asleep
          ? 'Board asleep'
          : 'Not connected';
    refs.status.classList.toggle('ok', connected);
    refs.status.classList.toggle('busy', busy);
    refs.status.classList.toggle('asleep', asleep && !connected && !busy);

    const power = powerStatus({ connected, asleep, sleepIn: state.sleepIn });
    refs.power.textContent = power.label;
    refs.power.dataset.kind = power.kind;
    refs.powerNote.textContent = power.note;

    refs.toggle.textContent = busy ? 'Connecting…' : connected ? 'Disconnect' : 'Connect';
    refs.toggle.dataset.connected = String(connected);
    refs.toggle.disabled = busy || !supported;

    refs.mode.textContent = connected ? 'Live' : 'Demo';
    refs.mode.classList.toggle('live', connected);
    refs.hint.textContent = connected ? HINT_LIVE : HINT_DEMO;

    renderFace(state.face);
    const kind = stableKind(state);
    refs.stable.textContent = STABLE_LABELS[kind];
    refs.stable.dataset.kind = kind;

    chips.forEach((chip, index) => {
      chip.setAttribute('aria-pressed', String(FACE_NUMBERS[index] === state.face));
      chip.disabled = connected;
    });

    refs.ax.textContent = state.ax.toFixed(2);
    refs.ay.textContent = state.ay.toFixed(2);
    refs.az.textContent = state.az.toFixed(2);
    setAxisBar(refs.barAx, state.ax);
    setAxisBar(refs.barAy, state.ay);
    setAxisBar(refs.barAz, state.az);

    renderRolls(rolls);

    refs.message.textContent = supported ? (error ?? '') : UNSUPPORTED_MESSAGE;
  }

  return { render };
}

// --- main.js ---
// Entry point: wires the dice state, the 3D cube and the panel together.


const view = document.getElementById('view');
if (!view) throw new Error('Missing #view element');

let controller;

const panel = bindPanel(document, {
  onToggle: () => {
    void controller.toggle();
  },
  onPickFace: (face) => {
    controller.showDemoFace(face);
  },
});

const cube = createCube(view);

controller = createDiceController((snapshot) => {
  panel.render(snapshot);
  cube.setReading(snapshot.state);
});

})();
