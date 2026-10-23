/** True when the viewer asked for less motion, or when the environment cannot tell (tests, old browsers). */
export const reducedMotion = () =>
  typeof window === 'undefined' || typeof window.matchMedia !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Length of a polyline through [x, y] pairs, used to draw it in with a dash animation. */
export const polylineLength = (points) =>
  Math.ceil(points.reduce((sum, p, i) => (i ? sum + Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) : 0), 0)) + 1
