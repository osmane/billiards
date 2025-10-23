export const toRad = deg => deg * Math.PI / 180;
export const toDeg = rad => rad * 180 / Math.PI;
export const normalizeAngle = deg => ((deg % 360) + 360) % 360;
export const formatAngle = deg => `${Math.round(normalizeAngle(deg))}\u00B0`;

export function rot(x, y, deg){
  const a = toRad(deg);
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: x * c - y * s, y: x * s + y * c };
}

export function rayCircleIntersection(px, py, dx, dy, cx, cy, r){
  const fx = px - cx;
  const fy = py - cy;
  const b = 2 * (dx * fx + dy * fy);
  const c = fx * fx + fy * fy - r * r;
  const disc = b * b - 4 * c;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const t1 = (-b - s) / 2;
  const t2 = (-b + s) / 2;
  const intersections = [t1, t2].filter(t => t >= 0);
  return intersections.length ? Math.min(...intersections) : null;
}
