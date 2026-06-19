// src/timing.ts — shared re-timing math, so footage sizing and zoom
// estimates use one source of truth.
export const MIN_SPEED = 0.5;
export const MAX_SPEED = 2.0;

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// Speed factor that sizes `sourceDuration` of footage to `voDuration` of narration.
export const speedFactor = (sourceDuration: number, voDuration: number): number =>
  clamp(sourceDuration / voDuration, MIN_SPEED, MAX_SPEED);
