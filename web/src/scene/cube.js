/* global THREE */

// The 3D die. It follows the board's tilt on a spring, snaps to the reported face
// once the board is still, hops when a roll lands, and glows in the face color.

import { FACE_GRAVITY, FACE_NUMBERS, NO_FACE, faceColor } from '../dice/faces.js';
import { isNewRoll } from '../dice/history.js';
import { HOP_IMPULSE, approach, sensorToSceneUp, stepHop } from './motion.js';
import { createOrbit } from './orbit.js';
import { createFaceTexture, createRadialTexture } from './textures.js';

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
export function createCube(container) {
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
