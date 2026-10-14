/** Original decorative lighting data; it does not change mapped geometry. */
export interface WindowGlow {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Radians along the façade's width axis. */
  angle: number;
  /** Stable variation per window, from zero to one. */
  phase: number;
}

export interface LampGlow {
  x: number;
  y: number;
}
