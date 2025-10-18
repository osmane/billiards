import { Ball, State } from "../ball"
import { CollisionThrow } from "./collisionthrow"
import { R, PhysicsContext } from "./constants"

const TOI_EPSILON = 1e-5

// Continuous collision detection (analytical time-of-impact for two moving balls)
// Returns the smallest t in [0, dt] where |(pa-pb) + (va-vb)*t| = 2R, or -1 if none.
function timeOfImpactBallBall(a: Ball, b: Ball, dt: number, context?: PhysicsContext): number {
  const radius = context?.R ?? R
  const dp = a.pos.clone().sub(b.pos)
  const dv = a.vel.clone().sub(b.vel)
  const r = 2 * radius
  const A = dv.dot(dv)
  const B = 2 * dp.dot(dv)
  const C = dp.dot(dp) - r * r
  if (A <= 1e-12) return -1 // no relative motion
  const disc = B * B - 4 * A * C
  if (disc < 0) return -1
  const sqrtD = Math.sqrt(disc)
  const t1 = (-B - sqrtD) / (2 * A)
  const t2 = (-B + sqrtD) / (2 * A)
  // We want the earliest non-negative root within the step
  let t = Number.POSITIVE_INFINITY
  if (t1 >= 0 && t1 <= dt) t = Math.min(t, t1)
  if (t2 >= 0 && t2 <= dt) t = Math.min(t, t2)
  return isFinite(t) ? t : -1
}

export class Collision {
  static debugHook?: (snapshot: {
    relNormalBefore: number
    relNormalAfterImpulse: number
    relNormalAfterCorrection: number
    normalImpulse: number
    tangentialImpulse: number
    distance: number
  }) => void

  static timeOfImpact(a: Ball, b: Ball, t: number, context?: PhysicsContext): number {
    return timeOfImpactBallBall(a, b, t, context)
  }

  static willCollide(a: Ball, b: Ball, t: number, context?: PhysicsContext): boolean {
    if (!(a.onTable() && b.onTable())) return false
    if (!(a.inMotion() || b.inMotion())) return false
    const radius = context?.R ?? R
    // Continuous check with analytic TOI to reduce tunneling at high speeds
    const toi = timeOfImpactBallBall(a, b, t, context)
    if (toi >= 0) return true
    // Fallback: proximity check with velocity-based filtering
    const futureA = a.futurePosition(t)
    const futureB = b.futurePosition(t)
    const offset = futureA.clone().sub(futureB)
    if (offset.lengthSq() >= 4 * radius * radius) {
      return false
    }
    // Only collide if balls are approaching each other
    const relVel = a.vel.clone().sub(b.vel)
    return relVel.dot(offset) < 0
  }

  static separateAtImpact(a: Ball, b: Ball, dt: number, context?: PhysicsContext) {
    const radius = context?.R ?? R
    const targetDistance = 2 * radius
    const toi = timeOfImpactBallBall(a, b, dt, context)
    const contactPosA = a.pos.clone()
    const contactPosB = b.pos.clone()

    if (toi >= 0) {
      contactPosA.addScaledVector(a.vel, toi)
      contactPosB.addScaledVector(b.vel, toi)
    }

    const separation = contactPosA.clone().sub(contactPosB)
    let distance = separation.length()

    if (distance < TOI_EPSILON) {
      // Degenerate case: balls share the same position, pick arbitrary normal
      separation.set(1, 0, 0)
      distance = Math.max(distance, TOI_EPSILON)
    }

    const normal = separation.multiplyScalar(1 / distance)
    const penetration = targetDistance - distance
    if (penetration <= 0) {
      return
    }

    // Use configurable separation bias (Codex 2025-10-21)
    // Default: R * 0.01 for ~0.28mm extra separation
    const separationBias = context?.collisionSeparationBias ?? 0.01
    const correctionMagnitude = (penetration + radius * separationBias) * 0.5
    const correction = normal.multiplyScalar(correctionMagnitude)
    a.pos.add(correction)
    b.pos.sub(correction)
    a.futurePos.copy(a.pos)
    b.futurePos.copy(b.pos)
  }

  static collide(a: Ball, b: Ball) {
    return Collision.updateVelocities(a, b)
  }

  static positionsAtContact(a: Ball, b: Ball) {
    const sep = a.pos.distanceTo(b.pos)
    const rv = a.vel.clone().sub(b.vel)
    const t = (sep - 2 * R) / rv.length() || 0
    return {
      a: a.pos.clone().addScaledVector(a.vel, t),
      b: b.pos.clone().addScaledVector(b.vel, t),
    }
  }

  static readonly model = new CollisionThrow()

  private static updateVelocities(a: Ball, b: Ball) {
    const context = a.physicsContext ?? b.physicsContext
    const normal = b.pos.clone().sub(a.pos)
    const dist = normal.length()
    let relNormalBefore = 0
    if (dist > 1e-6) {
      normal.multiplyScalar(1 / dist)
      relNormalBefore = a.vel.clone().sub(b.vel).dot(normal)
    } else {
      normal.set(0, 0, 0)
    }

    const impactSpeed = Collision.model.updateVelocities(a, b)
    let relNormalAfterImpulse = dist > 1e-6 ? a.vel.clone().sub(b.vel).dot(normal) : 0

    // Post-impulse correction: only apply if balls are STILL approaching (positive relNormalVel)
    // If relNormalVel < 0, balls are already separating - don't interfere!
    if (dist > 1e-6 && relNormalAfterImpulse > 0) {
      const correction = -0.5 * relNormalAfterImpulse
      a.vel.addScaledVector(normal, correction)
      b.vel.addScaledVector(normal, -correction)
    }

    let relNormalAfterCorrection =
      dist > 1e-6 ? a.vel.clone().sub(b.vel).dot(normal) : relNormalAfterImpulse

    // Apply minimum separation speed (Codex 2025-10-21)
    // Prevents balls from sticking when they have near-zero relative velocity
    const minSeparationSpeed = context?.minSeparationSpeed ?? 0.004
    if (dist > 1e-6 && Math.abs(relNormalAfterCorrection) < minSeparationSpeed) {
      // Apply minimum separation velocity
      const sign = relNormalAfterCorrection >= 0 ? -1 : 1  // If approaching or zero, push apart
      const boost = sign * minSeparationSpeed * 0.5
      a.vel.addScaledVector(normal, -boost)
      b.vel.addScaledVector(normal, boost)
      relNormalAfterCorrection = sign * minSeparationSpeed
    }

    if (Collision.debugHook) {
      Collision.debugHook({
        relNormalBefore,
        relNormalAfterImpulse,
        relNormalAfterCorrection,
        normalImpulse: Collision.model.normalImpulse,
        tangentialImpulse: Collision.model.tangentialImpulse,
        distance: dist,
      })
    }

    a.state = State.Sliding
    b.state = State.Sliding
    return impactSpeed
  }
}
