/* global THREE */

import { FACE_COLORS, FACE_PIPS } from '../../../dice/faces.js';

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
export function createFaceTexture(face) {
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
export function createRadialTexture(rgb, peakAlpha) {
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
