// Drag to turn the camera around the die, wheel to zoom, double-click to reset.

import { approach, clamp } from './motion.js';

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
export function createOrbit(canvas, camera) {
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
