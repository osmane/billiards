import { Vector3 } from "three"
import { unitAtAngle, upCross } from "../../utils/utils"
import { Ball, State } from "../ball"
import { cueToSpinUniversal } from "./physics"

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
