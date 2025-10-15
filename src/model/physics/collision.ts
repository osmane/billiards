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
    // Fallback: end-of-step proximity check (legacy behavior)
    return a.futurePosition(t).distanceToSquared(b.futurePosition(t)) < 4 * radius * radius
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

    const correctionMagnitude = (penetration + radius * 1e-4) * 0.5
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
    const impactSpeed = Collision.model.updateVelocities(a, b)
    a.state = State.Sliding
    b.state = State.Sliding
    return impactSpeed
  }
}
