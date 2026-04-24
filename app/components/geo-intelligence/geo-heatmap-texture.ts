'use client';

import {
  CanvasTexture,
  SRGBColorSpace,
} from 'three';

import {
  clamp,
  type GeoSceneHeatPoint,
} from './geo-globe-model';

function heatPointToCanvas(lat: number, lng: number, width: number, height: number) {
  const wrappedLng = ((((lng + 180) % 360) + 360) % 360) - 180;
  return {
    x: ((wrappedLng + 180) / 360) * width,
    y: ((90 - clamp(lat, -90, 90)) / 180) * height,
  };
}

function drawWrappedHeatSpot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  intensity: number,
  width: number,
) {
  const positions = [x];
  if (x - radius < 0) positions.push(x + width);
  if (x + radius > width) positions.push(x - width);

  for (const drawX of positions) {
    const gradient = ctx.createRadialGradient(drawX, y, 0, drawX, y, radius);
    gradient.addColorStop(0, `rgba(255, 232, 236, ${0.2 + intensity * 0.25})`);
    gradient.addColorStop(0.12, `rgba(255, 78, 104, ${0.25 + intensity * 0.38})`);
    gradient.addColorStop(0.42, `rgba(210, 28, 54, ${0.16 + intensity * 0.28})`);
    gradient.addColorStop(0.72, `rgba(125, 18, 34, ${0.06 + intensity * 0.16})`);
    gradient.addColorStop(1, 'rgba(125, 18, 34, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(drawX, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function createGeoHeatmapTexture(
  heatPoints: GeoSceneHeatPoint[],
  textureWidth: number,
) {
  if (heatPoints.length === 0 || typeof document === 'undefined') return null;

  const width = textureWidth;
  const height = Math.round(textureWidth / 2);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'lighter';

  for (const point of heatPoints) {
    const intensity = clamp(point.intensity);
    const weightBoost = clamp(Math.log10(point.weight + 1) / 3);
    const { x, y } = heatPointToCanvas(point.lat, point.lng, width, height);
    const radius = 28 + intensity * 82 + weightBoost * 22;

    drawWrappedHeatSpot(ctx, x, y, radius * 1.35, intensity * 0.72, width);
    drawWrappedHeatSpot(ctx, x, y, radius * 0.58, intensity, width);
  }

  ctx.globalCompositeOperation = 'source-over';
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 2;
  texture.needsUpdate = true;
  return texture;
}
