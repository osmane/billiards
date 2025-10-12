import { TableGeometry } from "../view/tablegeometry"
import { Table } from "../model/table"
import { upCross, unitAtAngle, norm, atan2, sin } from "../utils/utils"
import { AimEvent } from "../events/aimevent"
import { AimInputs } from "./aiminputs"
import { Ball, State } from "../model/ball"
import { cueToSpin } from "../model/physics/physics"
import { CueMesh } from "./cuemesh"
import { Mesh, Raycaster, Vector3, Quaternion } from "three"
import { R } from "../model/physics/constants"

export class Cue {
  mesh: Mesh
  helperMesh: Mesh
  placerMesh: Mesh
  hitPointMesh: Mesh  // 3D visualization of hit point on cue ball
  virtualCueMesh: Mesh  // Virtual cue stick showing exact hit direction and angle
  readonly offCenterLimit = 0.3
  readonly offCenterLimitMasse = 0.8  // Increased limit for massé shots
  readonly maxPower = 160 * R
  readonly defaultElevation = 0.17  // Default cue elevation (radians)
  t = 0
  aimInputs: AimInputs
  aim: AimEvent = new AimEvent()
  container: any // Container reference for trajectory updates
  masseMode: boolean = false  // Toggle for massé mode
  elevation: number = 0.17  // Current cue elevation angle in radians

  length = TableGeometry.tableX * 1

  constructor(container?: any) {
    this.container = container
    this.mesh = CueMesh.createCue(
      (R * 0.05) / 0.5,
      (R * 0.15) / 0.5,
      this.length
    )
    this.helperMesh = CueMesh.createHelper()
    this.placerMesh = CueMesh.createPlacer()
    this.hitPointMesh = CueMesh.createHitPoint()
    this.virtualCueMesh = CueMesh.createVirtualCue()
  }

  rotateAim(angle, table: Table) {
    this.aim.angle = this.aim.angle + angle
    this.mesh.rotation.z = this.aim.angle
    this.helperMesh.rotation.z = this.aim.angle
    this.aimInputs.showOverlap()
    this.avoidCueTouchingOtherBall(table)
    this.container?.updateTrajectoryPrediction()
  }

  adjustPower(delta) {
    this.aim.power = Math.min(this.maxPower, this.aim.power + delta)
    this.updateAimInput()
    this.container?.updateTrajectoryPrediction()
  }

  setPower(value: number) {
    this.aim.power = value * this.maxPower
    this.container?.updateTrajectoryPrediction()
  }

  hit(ball: Ball) {
    const aim = this.aim
    this.t = 0
    ball.state = State.Sliding
    ball.vel.copy(unitAtAngle(aim.angle).multiplyScalar(aim.power))
    ball.rvel.copy(cueToSpin(aim.offset, ball.vel))

    // Enable Magnus effect only when in massé mode
    ball.magnusEnabled = this.masseMode

    // Clear trajectory predictions when shot is made
    this.container?.trajectoryRenderer?.clearTrajectories()
  }

  aimAtNext(cueball, ball) {
    if (!ball) {
      return
    }
    const lineTo = norm(ball.pos.clone().sub(cueball.pos))
    this.aim.angle = atan2(lineTo.y, lineTo.x)
  }

  adjustSpin(delta: Vector3, table: Table) {
    const originalOffset = this.aim.offset.clone()
    const newOffset = originalOffset.clone().add(delta)
    this.setSpin(newOffset, table)
    this.container?.updateTrajectoryPrediction()
  }

  setSpin(offset: Vector3, table: Table) {
    const limit = this.masseMode ? this.offCenterLimitMasse : this.offCenterLimit
    if (offset.length() > limit) {
      offset.normalize().multiplyScalar(limit)
    }
    this.aim.offset.copy(offset)
    this.avoidCueTouchingOtherBall(table)
    this.updateAimInput()
    this.container?.updateTrajectoryPrediction()
  }

  avoidCueTouchingOtherBall(table: Table) {
    const limit = this.masseMode ? this.offCenterLimitMasse : this.offCenterLimit
    let n = 0
    while (n++ < 20 && this.intersectsAnything(table)) {
      this.aim.offset.y += 0.1
      if (this.aim.offset.length() > limit) {
        this.aim.offset.normalize().multiplyScalar(limit)
      }
    }

    if (n > 1) {
      this.updateAimInput()
    }
  }

  updateAimInput() {
    this.aimInputs?.updateVisualState(this.aim.offset.x, this.aim.offset.y)
    this.aimInputs?.updatePowerSlider(this.aim.power / this.maxPower)
    this.aimInputs?.showOverlap()
  }

  moveTo(pos) {
    this.aim.pos.copy(pos)
    this.mesh.rotation.z = this.aim.angle
    this.helperMesh.rotation.z = this.aim.angle

    // Apply elevation rotation (X-axis rotation for vertical tilt)
    // Set rotation order to ZXY so that Z (aim) is applied first, then X (elevation)
    // This ensures elevation stays constant relative to table while aim rotates
    this.mesh.rotation.order = 'ZXY'
    this.mesh.rotation.x = -this.elevation

    const offset = this.spinOffset()
    const swing =
      (sin(this.t + Math.PI / 2) - 1) * 2 * R * (this.aim.power / this.maxPower)
    const distanceToBall = unitAtAngle(this.aim.angle)
      .clone()
      .multiplyScalar(swing)
    this.mesh.position.copy(pos.clone().add(offset).add(distanceToBall))
    this.helperMesh.position.copy(pos)
    this.placerMesh.position.copy(pos)
    this.placerMesh.rotation.z = this.t

    // Update hit point position on cue ball surface
    this.updateHitPoint(pos)

    // Update virtual cue position and orientation
    this.updateVirtualCue(pos)
  }

  updateHitPoint(ballPos: Vector3) {
    const baseDirection = unitAtAngle(this.aim.angle + Math.PI)
    let direction = new Vector3(baseDirection.x, baseDirection.y, 0)

    const horizontalAngle = -this.aim.offset.x * Math.PI / 2
    direction.applyAxisAngle(new Vector3(0, 0, 1), horizontalAngle)

    const verticalAngle = -this.aim.offset.y * Math.PI / 2
    const perpendicularAxis = upCross(baseDirection).normalize()
    direction.applyAxisAngle(perpendicularAxis, verticalAngle)

    const finalDirection = direction.normalize()

    this.hitPointMesh.position.copy(ballPos)

    const up = new Vector3(0, 0, 1)
    const quaternion = new Quaternion()
    quaternion.setFromUnitVectors(up, finalDirection)
    this.hitPointMesh.setRotationFromQuaternion(quaternion)
  }

  updateVirtualCue(ballPos: Vector3) {
    const baseDirection = unitAtAngle(this.aim.angle + Math.PI)
    let direction = new Vector3(baseDirection.x, baseDirection.y, 0)

    const horizontalAngle = -this.aim.offset.x * Math.PI / 2
    direction.applyAxisAngle(new Vector3(0, 0, 1), horizontalAngle)

    const verticalAngle = -this.aim.offset.y * Math.PI / 2
    const perpendicularAxis = upCross(baseDirection).normalize()
    direction.applyAxisAngle(perpendicularAxis, verticalAngle)

    const finalDirection = direction.normalize()
    const hitPointOnSurface = ballPos.clone().addScaledVector(finalDirection, R)

    this.virtualCueMesh.position.copy(hitPointOnSurface)

    const cueDirection = unitAtAngle(this.aim.angle + Math.PI)
    const cueDirection3D = new Vector3(
      cueDirection.x * Math.cos(this.elevation),
      cueDirection.y * Math.cos(this.elevation),
      Math.sin(this.elevation)
    ).normalize()

    const negativeYAxis = new Vector3(0, -1, 0)
    const quaternion = new Quaternion()
    quaternion.setFromUnitVectors(negativeYAxis, cueDirection3D)
    this.virtualCueMesh.setRotationFromQuaternion(quaternion)
  }

  toggleVirtualCue() {
    this.virtualCueMesh.visible = !this.virtualCueMesh.visible
  }

  update(t) {
    this.t += t
    this.moveTo(this.aim.pos)
  }

  placeBallMode() {
    this.mesh.visible = false
    this.placerMesh.visible = true
    this.virtualCueMesh.visible = false
    this.aim.angle = 0
  }

  aimMode() {
    this.mesh.visible = true
    this.placerMesh.visible = false
    this.virtualCueMesh.visible = false
  }

  spinOffset() {
    // IMPORTANT: Clone upCross result since it returns a singleton object!
    return upCross(unitAtAngle(this.aim.angle)).clone()
      .multiplyScalar(this.aim.offset.x * 2 * R)
      .setZ(this.aim.offset.y * 2 * R)
  }

  intersectsAnything(table: Table) {
    const offset = this.spinOffset()
    const origin = table.cueball.pos.clone().add(offset)
    const direction = norm(unitAtAngle(this.aim.angle + Math.PI).setZ(0.1))
    const raycaster = new Raycaster(origin, direction)
    const items = table.balls.map((b) => b.ballmesh.mesh)
    if (table.mesh) {
      items.push(table.mesh)
    }
    const intersections = raycaster.intersectObjects(items, true)
    return intersections.length > 0
  }

  showHelper(b) {
    this.helperMesh.visible = b
  }

  toggleHelper() {
    this.showHelper(!this.helperMesh.visible)
  }

  toggleMasseMode() {
    this.masseMode = !this.masseMode

    // Reapply current offset to ensure it's within new limits
    if (!this.masseMode) {
      const offset = this.aim.offset.clone()
      if (offset.length() > this.offCenterLimit) {
        offset.normalize().multiplyScalar(this.offCenterLimit)
        this.aim.offset.copy(offset)
      }
      // Reset elevation to default when exiting massé mode
      this.elevation = this.defaultElevation
    }

    // Always update visual state when massé mode changes
    this.updateAimInput()
    this.container?.updateTrajectoryPrediction()
    return this.masseMode
  }

  setMassePreset(angleDegrees: number, direction: 'left' | 'right') {
    this.masseMode = true

    const angleRad = (angleDegrees * Math.PI) / 180

    // Calculate vertical offset: higher angle = hit higher on ball's top hemisphere
    // 90° (vertical) → offsetY = 0.75 (top), 65° → offsetY ≈ 0.54 (upper-middle)
    const normalizedAngle = angleRad / (Math.PI / 2)
    const offsetY = normalizedAngle * 0.75

    // Horizontal offset for spin direction
    const offsetX = direction === 'right' ? 0.5 : -0.5

    this.aim.offset.set(offsetX, offsetY, 0)

    // Ensure within massé limits
    if (this.aim.offset.length() > this.offCenterLimitMasse) {
      this.aim.offset.normalize().multiplyScalar(this.offCenterLimitMasse)
    }

    // Set cue elevation: preset angle IS the elevation angle
    // In billiards terminology: angle is measured from horizontal (table surface)
    // 0° = horizontal (parallel to table), 90° = vertical (perpendicular to table)
    // Our elevation also measures from horizontal, so use angleRad directly
    this.elevation = angleRad

    // Set controlled power for massé shots
    this.aim.power = this.maxPower * 0.35

    this.updateAimInput()
    this.container?.updateTrajectoryPrediction()
  }
}
