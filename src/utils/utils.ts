import { Vector3 } from "three"

export const zero = new Vector3(0, 0, 0)
export const up = new Vector3(0, 0, 1)

export function vec(v) {
  return new Vector3(v.x, v.y, v.z)
}

const upCrossVec = new Vector3()
export function upCross(v) {
  return upCrossVec.copy(up).cross(v)
}
const normVec = new Vector3()
export function norm(v) {
  return normVec.copy(v).normalize()
}

const vc = new Vector3()
export function passesThroughZero(v, dv) {
  return vc.copy(v).add(dv).dot(v) <= 0
}

export function unitAtAngle(theta) {
  return new Vector3(1, 0, 0).applyAxisAngle(up, theta)
}

export function round(num) {
  const sign = Math.sign(num)
  return (sign * Math.floor((Math.abs(num) + Number.EPSILON) * 10000)) / 10000
}

export function round2(num) {
  return Math.round((num + Number.EPSILON) * 100) / 100
}

export function roundVec(v) {
  v.x = round(v.x)
  v.y = round(v.y)
  v.z = round(v.z)
  return v
}

export function roundVec2(v) {
  v.x = round2(v.x)
  v.y = round2(v.y)
  v.z = round2(v.z)
  return v
}

export function atan2(y, x) {
  return Math.fround(Math.atan2(y, x))
}

export function pow(y, x) {
  return Math.fround(Math.pow(y, x))
}

export function sin(theta) {
  // Precision: avoid unnecessary Math.fround – keep double precision for stability
  return Math.sin(theta)
}

export function cos(theta) {
  // Precision: avoid unnecessary Math.fround – keep double precision for stability
  return Math.cos(theta)
}

export function sqrt(theta) {
  // Precision: avoid unnecessary Math.fround – keep double precision for stability
  return Math.sqrt(theta)
}

export function exp(theta) {
  // Precision: avoid unnecessary Math.fround – keep double precision for stability
  return Math.exp(theta)
}


// Zero-out tiny components to reduce numerical noise without losing precision
export function snapSmall(v: Vector3, eps = 1e-6) {
  if (Math.abs(v.x) < eps) v.x = 0
  if (Math.abs(v.y) < eps) v.y = 0
  if (Math.abs(v.z) < eps) v.z = 0
  return v
}
