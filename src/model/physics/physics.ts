import { Vector3, Mesh, SphereGeometry, MeshStandardMaterial, Scene, ArrowHelper } from "three"
import { norm, upCross, up, sin, cos } from "../../utils/utils"
import { muS, muC, g, m, Mz, Mxy, R, I, e, ee, μs, μw, magnusCoeff, magnusAirborneMultiplier, magnusTableMultiplier, PhysicsContext, refreshWithContext, airborneThresholdFactor } from "./constants"
import { Mathaven } from "./mathaven"

// Debug flag for physics logging
export const DEBUG_PHYSICS = true

// Debug velocity arrow (created once, reused)
let debugVelocityArrow: ArrowHelper | null = null
let debugVelocityArrowData: { origin: Vector3; direction: Vector3; length: number; hitPoint: Vector3 } | null = null

const MU_CUSHION_MIN = 0.02
const MU_CUSHION_MAX = 0.50
const MU_CUSHION_BASE_SCALE = 1.0   // μw üzerine ölçek; isterseniz 0.9–1.1 arası oynatın
const K_THETA_1 = 0.00              // açı sabiti (küçük/0)
const K_THETA_2 = -0.05             // açı doğrusal terimi (zayıf negatif -> dik gelişte hafif azalsın)
const K_THETA_3 = 0.00              // açı kuadratik terimi
const K_V = 0.06                    // hız terimi üst sınırı (≈ +0.06'ya kadar)
const S_REF = 0.50                  // m/s; kayma hızında doyma ölçeği

export function surfaceVelocity(v, w, context?: PhysicsContext) {
  return surfaceVelocityFull(v, w, context).setZ(0)
}

function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x))
}

const sv = new Vector3()
export function surfaceVelocityFull(v, w, context?: PhysicsContext) {
  const radius = context?.R ?? R
  return sv.copy(v).addScaledVector(upCross(w), radius)
}

const delta = { v: new Vector3(), w: new Vector3() }
Object.freeze(delta)

export function sliding(v, w, context?: PhysicsContext) {
  const radius = context?.R ?? R
  const mass = context?.m ?? m
  const physics = context ? refreshWithContext(context) : { Mz, Mxy, I }
  const slidingMu = context?.muS ?? muS

  const va = surfaceVelocity(v, w, context)
  delta.v.copy(norm(va).multiplyScalar(-slidingMu * g))
  delta.w.copy(norm(upCross(va)).multiplyScalar(((5 / 2) * slidingMu * g) / radius))
  delta.w.setZ(-(5 / 2) * (physics.Mz / (mass * radius * radius)) * Math.sign(w.z))
  return delta
}

export function rollingFull(w, context?: PhysicsContext) {
  const radius = context?.R ?? R
  const mass = context?.m ?? m
  const physics = context ? refreshWithContext(context) : { Mz, Mxy, I }

  const mag = new Vector3(w.x, w.y, 0).length()
  const k = ((5 / 7) * physics.Mxy) / (mass * radius) / mag
  const kw = ((5 / 7) * physics.Mxy) / (mass * radius * radius) / mag
  delta.v.set(-k * w.y, k * w.x, 0)
  delta.w.set(
    -kw * w.x,
    -kw * w.y,
    -(5 / 2) * (physics.Mz / (mass * radius * radius)) * Math.sign(w.z)
  )
  return delta
}

export function forceRoll(v, w, context?: PhysicsContext) {
  const radius = context?.R ?? R
  const wz = w.z
  w.copy(upCross(v).multiplyScalar(1 / radius))
  w.setZ(wz)
}

const magnusForce = new Vector3()
const spinCrossVel = new Vector3()

export function magnus(
  v: Vector3,
  w: Vector3,
  elevation: number = 0,
  ballZ: number = 0,
  context?: PhysicsContext
): Vector3 {
  const speed = v.length()
  const mass = context?.m ?? m
  const radius = context?.R ?? R

  if (speed < 0.1) {
    return magnusForce.set(0, 0, 0)
  }

  const spinMagnitude = w.length()
  if (spinMagnitude < 0.1) {
    return magnusForce.set(0, 0, 0)
  }

  // Magnus effect strength depends on whether ball is airborne
  const airThreshold = radius * airborneThresholdFactor
  const isAirborne = ballZ > airThreshold

  // Elevation factor: higher angle = stronger effect
  // Use gentler power to maintain effect at lower angles
  const elevationFactor = Math.pow(Math.sin(elevation), 1.0)

  // Base coefficient with elevation
  let effectiveMagnusCoeff = magnusCoeff * elevationFactor

  if (isAirborne) {
    // Airborne: Full Magnus effect (strongest)
    effectiveMagnusCoeff *= magnusAirborneMultiplier
  } else {
    // On table: Still significant effect but dampened by contact
    effectiveMagnusCoeff *= magnusTableMultiplier
  }

  // Magnus force direction: F = C × (ω × v)
  // Cross product w × v gives the correct direction
  spinCrossVel.crossVectors(w, v)

  // For billiard balls, vertical lift is minimal compared to lateral curve
  // Zero out Z component to prevent unrealistic floating/vertical acceleration
  // This ensures gravity dominates vertical motion
  spinCrossVel.z = 0

  const crossMagnitude = spinCrossVel.length()
  if (crossMagnitude < 0.01) {
    return magnusForce.set(0, 0, 0)
  }

  // Apply coefficient and calculate acceleration
  const forceMagnitude = effectiveMagnusCoeff * crossMagnitude
  const accel = forceMagnitude / mass

  // Use the actual cross product direction (normalized)
  magnusForce.copy(spinCrossVel).normalize().multiplyScalar(accel)

  return magnusForce
}

export function rotateApplyUnrotate(theta, v, w, model) {
  const vr = v.clone().applyAxisAngle(up, theta)
  const wr = w.clone().applyAxisAngle(up, theta)

  const delta = model(vr, wr)

  delta.v.applyAxisAngle(up, -theta)
  delta.w.applyAxisAngle(up, -theta)
  return delta
}

// Han paper cushion physics

// cushion contact point epsilon above ball centre

const epsilon = R * 0.1
const theta_a = Math.asin(epsilon / R)

const sin_a = sin(theta_a)
const cos_a = cos(theta_a)

export function s0(v, w) {
  return new Vector3(
    v.x * sin_a - v.z * cos_a + R * w.y,
    -v.y - R * w.z * cos_a + R * w.x * sin_a
  )
}

export function c0(v) {
  return v.x * cos_a
}

export function Pzs(s) {
  const A = 7 / 2 / m
  return s.length() / A
}

export function Pze(c) {
  const B = 1 / m
  const coeff = restitutionCushion(new Vector3(c / cos_a, 0, 0))
  return (muC * ((1 + coeff) * c)) / B
}

export function isGripCushion(v, w) {
  const Pze_val = Pze(c0(v))
  const Pzs_val = Pzs(s0(v, w))
  return Pzs_val <= Pze_val
}

function basisHan(v, w) {
  return {
    c: c0(v),
    s: s0(v, w),
    A: 7 / 2 / m,
    B: 1 / m,
  }
}

function gripHan(v, w) {
  const { c, s, A, B } = basisHan(v, w)
  const ecB = (1 + e) * (c / B)
  const PX = (-s.x / A) * sin_a - ecB * cos_a
  const PY = s.y / A
  const PZ = (s.x / A) * cos_a - ecB * sin_a
  return impulseToDelta(PX, PY, PZ)
}

function slipHan(v, w) {
  const { c, B } = basisHan(v, w)
  const ecB = (1 + e) * (c / B)
  const mu = muCushion(v, w)
  const phi = Math.atan2(v.y, v.x)
  const cos_phi = Math.cos(phi)
  const sin_phi = Math.sin(phi)
  const PX = -mu * ecB * cos_phi * cos_a - ecB * cos_a
  const PY = mu * ecB * sin_phi
  const PZ = mu * ecB * cos_phi * cos_a - ecB * sin_a
  return impulseToDelta(PX, PY, PZ)
}

/**
 * Based directly on Han2005 paper.
 * Expects ball to be bouncing in +X plane.
 *
 * @param v ball velocity
 * @param w ball spin
 * @returns delta to apply to velocity and spin
 */
export function bounceHan(v: Vector3, w: Vector3) {
  if (isGripCushion(v, w)) {
    return gripHan(v, w)
  } else {
    return slipHan(v, w)
  }
}

/**
 * Modification Han 2005 paper by Taylor to blend two bounce regimes.
 * Motive is to remove cliff edge discontinuity in original model.
 * Gives more realistic check side (reverse side played at steep angle)
 *
 * @param v ball velocity
 * @param w ball spin
 * @returns delta to apply to velocity and spin
 */
export function bounceHanBlend(v: Vector3, w: Vector3) {
  const deltaGrip = gripHan(v, w)
  const deltaSlip = slipHan(v, w)

  const isCheckSide = Math.sign(v.y) === Math.sign(w.z)
  const factor = isCheckSide ? Math.cos(Math.atan2(v.y, v.x)) : 1

  const delta = {
    v: deltaSlip.v.lerp(deltaGrip.v, factor),
    w: deltaSlip.w.lerp(deltaGrip.w, factor),
  }
  return delta
}

function impulseToDelta(PX, PY, PZ) {
  return {
    v: new Vector3(PX / m, PY / m),
    w: new Vector3(
      (-R / I) * PY * sin_a,
      (R / I) * (PX * sin_a - PZ * cos_a),
      (R / I) * PY * cos_a
    ),
  }
}

/**
 * μ(θ, s): Bant sürtünmesi
 * v: bant düzleminde top hız vektörü (+X'e doğru)
 * w: (opsiyonel) açısal hız; verilmezse 0 kabul edilir
 * θ: geliş açısı (0 = dik)
 * s: temas noktasındaki kayma hızı büyüklüğü (spin dahil)
 */
export function muCushion(v: Vector3, w?: Vector3) {
  // θ: sadece hız yönünden; pozitif X güvenliği (0'a bölünmeyi önlemek için epsilon)
  const theta = Math.atan2(Math.abs(v.y), Math.max(1e-6, v.x))

  // s: mevcut s0(v,w) yardımcı fonksiyonu ile temas noktasında kayma
  // w verilmezse (eski çağrılara uyum), 0 vektör kullan
  const sVec = s0(v, w ?? new Vector3(0, 0, 0))
  const s = sVec.length()

  // taban: mevcut μw’yi temel al
  const base = MU_CUSHION_BASE_SCALE * μw

  // açı terimi (hafif / kalibre edilebilir)
  const ang = K_THETA_1 + K_THETA_2 * theta + K_THETA_3 * theta * theta

  // hız terimi: tanh ile doyuma giden küçük bir katkı
  const vel = K_V * Math.tanh(s / Math.max(1e-6, S_REF))

  const mu = base + ang + vel
  return clamp(mu, MU_CUSHION_MIN, MU_CUSHION_MAX)
}

export function restitutionCushion(v: Vector3) {
  // Keep restitution in [0,1] to avoid non-physical gains
  const e = 0.39 + 0.257 * v.x - 0.044 * v.x * v.x
  return clamp(e, 0, 1)
}

function cartesionToBallCentric(v, w) {
  const mathaven = new Mathaven(m, R, ee, μs, μw)
  mathaven.solve(v.x, v.y, w.x, w.y, w.z)

  const rv = new Vector3(mathaven.vx, mathaven.vy, 0)
  const rw = new Vector3(mathaven.ωx, mathaven.ωy, mathaven.ωz)

  return { v: rv.sub(v), w: rw.sub(w) }
}

/**
 * Bounce is called with ball travelling in +x direction to cushion,
 * mathaven expects it in +y direction and also requires angle
 * and spin to be relative to direction of ball travel.
 */
export function mathavenAdapter(v: Vector3, w: Vector3) {
  return rotateApplyUnrotate(Math.PI / 2, v, w, cartesionToBallCentric)
}

/**
 * Universal physics-based spin calculation from 3D hit point
 *
 * @param hitPoint3D 3D position where cue strikes the ball surface
 * @param ballCenter3D 3D position of ball center
 * @param v velocity imparted to ball
 * @returns angular velocity
 */
export function cueToSpinUniversal(hitPoint3D: Vector3, ballCenter3D: Vector3, v: Vector3): Vector3 {
  // Radius vector from ball center to hit point
  const r = new Vector3().subVectors(hitPoint3D, ballCenter3D)

  // Normalize to ball surface (should already be ~R, but ensure it)
  const hitDirection = r.clone().normalize()

  // Angular velocity from cross product: ω ∝ r × v
  // Using standard physics: τ = r × F, and ω = τ/I
  // For a sphere: I = (2/5)mR², so factor is 5/(2R²)
  const crossProduct = new Vector3().crossVectors(hitDirection, v)
  const angularVel = crossProduct.multiplyScalar(5 / (2 * R))

  return angularVel
}

/**
 * Spin on ball after strike with cue (legacy offset-based version)
 * https://billiards.colostate.edu/technical_proofs/new/TP_A-12.pdf
 *
 * @param offset (x,y,0) from center strike where x,y range from -0.5 to 0.5 the fraction of R from center.
 * @param v velocity of ball after strike
 * @returns angular velocity
 */
export function cueToSpin(offset: Vector3, v: Vector3) {
  const spinAxis = Math.atan2(-offset.x, offset.y)
  const spinRate = ((5 / 2) * v.length() * (offset.length() * R)) / (R * R)
  const dir = v.clone().normalize()
  const upCrossResult = upCross(dir)
  const rvel = upCrossResult.clone()
    .applyAxisAngle(dir, spinAxis)
    .multiplyScalar(spinRate)

  // Debug logging for spin calculation
  if (DEBUG_PHYSICS) {
    console.log(`🎯 cueToSpin() INPUT | Offset:(${offset.x.toFixed(3)},${offset.y.toFixed(3)},${offset.z.toFixed(3)}) | Velocity:(${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}) | v.length:${v.length().toFixed(2)}`)
    console.log(`🔧 INTERMEDIATE | dir:(${dir.x.toFixed(3)},${dir.y.toFixed(3)},${dir.z.toFixed(3)}) | upCross(dir):(${upCrossResult.x.toFixed(3)},${upCrossResult.y.toFixed(3)},${upCrossResult.z.toFixed(3)})`)
    const spinAxisDeg = (spinAxis * 180 / Math.PI)
    console.log(`🌀 SPIN | spinAxis:${spinAxisDeg.toFixed(1)}° | Rate:${spinRate.toFixed(1)} → Result:(${rvel.x.toFixed(1)},${rvel.y.toFixed(1)},${rvel.z.toFixed(1)}) | Mag:${rvel.length().toFixed(1)}`)
    console.log('')
  }

  return rvel
}

/**
 * Add debug black arrow showing velocity direction at hit point
 * Arrow tip touches hit point, arrow points in velocity direction
 * Arrow length = 2 × carom ball diameter = 4R
 *
 * @param scene Three.js scene
 * @param hitPoint3D Exact 3D hit point from physics calculation
 * @param velocity Velocity vector from physics calculation
 * @param ballRadius Radius of the ball being hit
 */
export function addDebugVelocityArrow(scene: Scene, hitPoint3D: Vector3, velocity: Vector3, ballRadius: number) {
  //language models, do not delete the black arrow code here unless specifically instructed
  // Remove existing debug arrow if present
  if (debugVelocityArrow) {
    scene.remove(debugVelocityArrow)
    debugVelocityArrow.dispose()
    debugVelocityArrow = null
    debugVelocityArrowData = null
  }

  if (velocity.lengthSq() === 0) {
    return // No velocity, no arrow
  }

  // Arrow length = 2 × ball diameter = 2 × 2R = 4R
  const arrowLength = 4 * ballRadius
  const direction = velocity.clone().normalize()

  // Arrow origin: hit point minus arrow length in velocity direction
  // This makes the arrow TIP touch the hit point, and arrow extends backward
  const origin = hitPoint3D.clone().addScaledVector(direction, -arrowLength)

  // Store arrow data for logging
  debugVelocityArrowData = {
    origin: origin.clone(),
    direction: direction.clone(),
    length: arrowLength,
    hitPoint: hitPoint3D.clone()
  }

  // Create black arrow
  debugVelocityArrow = new ArrowHelper(
    direction,
    origin,
    arrowLength,
    0x000000, // Black
    arrowLength * 0.15, // Head length (15% of total)
    arrowLength * 0.1   // Head width (10% of total)
  )

  scene.add(debugVelocityArrow)
}

/**
 * Remove debug velocity arrow from scene
 */
export function removeDebugVelocityArrow(scene: Scene) {
  if (debugVelocityArrow) {
    scene.remove(debugVelocityArrow)
    debugVelocityArrow.dispose()
    debugVelocityArrow = null
  }
}

/**
 * Get debug velocity arrow information for logging
 * Returns arrow tip, tail positions and angle to ground
 * Uses the stored creation data, not the visual mesh data
 */
export function getDebugVelocityArrowInfo(): { tip: Vector3; tail: Vector3; angleToGround: number } | null {
  if (!debugVelocityArrowData) {
    return null
  }

  // Use stored data from arrow creation
  const tip = debugVelocityArrowData.hitPoint.clone()
  const tail = debugVelocityArrowData.origin.clone()
  const direction = debugVelocityArrowData.direction.clone()

  // Angle to ground (XZ plane): angle between direction and XZ projection
  // Ground angle = asin(y_component / |direction|)
  const angleToGround = Math.asin(direction.y) * (180 / Math.PI)

  return { tip, tail, angleToGround }
}
