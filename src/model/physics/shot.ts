import { Vector3 } from "three"
import { unitAtAngle, upCross } from "../../utils/utils"
import { Ball, State } from "../ball"
import { cueToSpinUniversal } from "./physics"
import { elevationVerticalImpulseScale, topHitJumpDirectionalGain, topHitJumpElevationRef } from "./constants"

export function computeHitPointAndDirection(
  aim: { angle: number; offset: Vector3 },
  ballPos: Vector3,
  radius: number,
) {
  const base = unitAtAngle(aim.angle + Math.PI)        // cue yönü tabanı
  let dir = new Vector3(base.x, base.y, 0)

  // offset.x / offset.y -> doğru eksenlerde ARCSIN ile açıya çevirin
  const clamp = (x: number) => Math.max(-1, Math.min(1, x))
  const horiz = Math.asin(clamp(aim.offset.x))
  dir.applyAxisAngle(new Vector3(0,0,1), horiz)

  const vert = -Math.asin(clamp(aim.offset.y))
  const perp = upCross(base).normalize()
  dir.applyAxisAngle(perp, vert)

  const shotDir = dir.normalize()
  const hitPoint = ballPos.clone().addScaledVector(shotDir, radius) // küre üzerinde nokta
  return { hitPoint, shotDir }
}

export function applyShotKinematics(ball: Ball, aim: { angle: number; offset: Vector3; power: number }, elevation: number) {
  const { hitPoint, shotDir } = computeHitPointAndDirection(aim, ball.pos, ball.radius)
  ball.state = State.Sliding
  ball.vel.copy(shotDir.multiplyScalar(aim.power))                           // hız yönü = 3B yön
  ball.rvel.copy(cueToSpinUniversal(hitPoint, ball.pos, ball.vel))           // spin = 3B temas noktasından
  ball.magnusEnabled = elevation > 0.2
  ball.magnusElevation = elevation
  return { hitPoint }
}

export type ShotPose = {
  /** Cue stick'in ileri doğru yönü (mesh -Y ekseni dünya ekseninde); TOP TERS YÖNE GİDER */
  cueDir: Vector3
  /** Dünya koordinatlarında 3B darbe noktası (top merkezinin üzerinde, küre yüzeyi) */
  hitPointWorld: Vector3
  elevation: number
  power: number
}

// Build a ShotPose from aim parameters using the same mapping as the cue
// (negative arcsin mapping for offsets, elevation applied to cue direction).
export function makeShotPoseFromAim(
  ball: Ball,
  aim: { angle: number; offset: Vector3; power: number },
  elevation: number
): ShotPose {
  // Cue direction (+Z up)
  const base = unitAtAngle(aim.angle + Math.PI)
  const cueDir = new Vector3(
    base.x * Math.cos(elevation),
    base.y * Math.cos(elevation),
    Math.sin(elevation)
  ).normalize()

  // Hit point on ball surface
  const clamp = (x: number) => Math.max(-1, Math.min(1, x))
  let hitDir = new Vector3(base.x, base.y, 0)
  const horiz = -Math.asin(clamp(aim.offset.x))
  hitDir.applyAxisAngle(new Vector3(0, 0, 1), horiz)
  const perp = upCross(base).normalize()
  const vert = -Math.asin(clamp(aim.offset.y))
  hitDir.applyAxisAngle(perp, vert)
  hitDir.normalize()

  const hitPointWorld = ball.pos.clone().addScaledVector(hitDir, ball.radius)
  return { cueDir, hitPointWorld, elevation, power: aim.power }
}

export function applyShotFromPose(ball: Ball, pose: ShotPose) {
  const { cueDir, hitPointWorld, elevation, power } = pose

  ball.state = State.Sliding

  // Top, ıstakanın baktığı yönün TERSİNE hareket eder
  const effDir = cueDir.clone()
  if (Math.abs(elevation) > 0.001) {
    // Base reduction of vertical impulse
    const kBase = Math.max(0, Math.min(1, elevationVerticalImpulseScale))
    effDir.z *= kBase

    // Directional modulation from hit point (top vs bottom)
    const hitDir = hitPointWorld.clone().sub(ball.pos).normalize()
    const elevFactor = Math.min(1, Math.abs(elevation) / Math.max(1e-6, topHitJumpElevationRef))
    const kTop = 1 + (topHitJumpDirectionalGain * hitDir.z * elevFactor)
    effDir.z *= kTop

    if (effDir.lengthSq() > 0) effDir.normalize()
  }
  const shotVel = effDir.multiplyScalar(-power)
  ball.vel.copy(shotVel)
  // Record initial speed for speed-history dependent spin decay logic
  try { (ball as any).initialShotSpeed = Math.max(0, shotVel.length()) } catch {}

  // Spin: 3B darbe noktasından, tek kaynak
  ball.rvel.copy(cueToSpinUniversal(hitPointWorld, ball.pos, ball.vel))

  // Magnus
  ball.magnusEnabled = elevation > 0.2
  ball.magnusElevation = elevation
}
