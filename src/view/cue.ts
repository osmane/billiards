import { TableGeometry } from "../view/tablegeometry"
import { Table } from "../model/table"
import { upCross, unitAtAngle, norm, atan2, sin } from "../utils/utils"
import { AimEvent } from "../events/aimevent"
import { AimInputs } from "./aiminputs"
import { Ball, State } from "../model/ball"
import { cueToSpin } from "../model/physics/physics"
import { CueMesh } from "./cuemesh"
import { Mesh, Raycaster, Vector3 } from "three"
import { R } from "../model/physics/constants"

export class Cue {
  mesh: Mesh
  helperMesh: Mesh
  placerMesh: Mesh
  readonly offCenterLimit = 0.3
  readonly maxPower = 160 * R
  t = 0
  aimInputs: AimInputs
  aim: AimEvent = new AimEvent()
  container: any // Container reference for trajectory updates

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

    // Calculate spin from offset (existing English/side spin)
    const baseSpin = cueToSpin(aim.offset, ball.vel)

    // Add vertical spin component from cue elevation for massé/piqué shots
    if (aim.elevation > 0) {
      // Vertical spin magnitude based on elevation angle (0-90 degrees)
      const elevationRad = (aim.elevation * Math.PI) / 180
      const verticalSpinMagnitude = ball.vel.length() * Math.sin(elevationRad) * (5 / (2 * ball.radius))

      // Spin aligned with velocity direction (for Magnus curve effect)
      const aimAngleRad = aim.angle
      let spinX = verticalSpinMagnitude * Math.cos(aimAngleRad)
      let spinY = verticalSpinMagnitude * Math.sin(aimAngleRad) * 0.3

      // Apply horizontal offset rotation if offset exists
      // Converts UI offset to physics offset (-0.5 to +0.5 range)
      const horizontalOffset = aim.offset.x * this.offCenterLimit
      if (horizontalOffset !== 0) {
        // Rotation angle: max ±45° at ±0.5 offset
        const offsetAngle = horizontalOffset * Math.PI / 4
        const cos = Math.cos(offsetAngle)
        const sin = Math.sin(offsetAngle)
        const originalSpinX = spinX
        const originalSpinY = spinY

        // Apply 2D rotation matrix
        spinX = originalSpinX * cos - originalSpinY * sin
        spinY = originalSpinX * sin + originalSpinY * cos
      }

      const verticalSpin = new Vector3(spinX, spinY, 0)
      ball.rvel.copy(baseSpin).add(verticalSpin)
    } else {
      ball.rvel.copy(baseSpin)
    }

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
    if (offset.length() > this.offCenterLimit) {
      offset.normalize().multiplyScalar(this.offCenterLimit)
    }
    this.aim.offset.copy(offset)
    this.avoidCueTouchingOtherBall(table)
    this.updateAimInput()
    this.container?.updateTrajectoryPrediction()
  }

  adjustElevation(delta: number) {
    // Prevent manual elevation changes when preset is locked
    if (this.aimInputs?.presetLocked) {
      return
    }
    // Clamp elevation between 0 (horizontal) and 90 (vertical) degrees
    this.aim.elevation = Math.max(0, Math.min(90, this.aim.elevation + delta))
    this.updateAimInput()
    this.container?.updateTrajectoryPrediction()
  }

  setElevation(degrees: number) {
    this.aim.elevation = Math.max(0, Math.min(90, degrees))
    this.updateAimInput()
    this.container?.updateTrajectoryPrediction()
  }

  avoidCueTouchingOtherBall(table: Table) {
    let n = 0
    while (n++ < 20 && this.intersectsAnything(table)) {
      this.aim.offset.y += 0.1
      if (this.aim.offset.length() > this.offCenterLimit) {
        this.aim.offset.normalize().multiplyScalar(this.offCenterLimit)
      }
    }

    if (n > 1) {
      this.updateAimInput()
    }
  }

  updateAimInput() {
    this.aimInputs?.updateVisualState(this.aim.offset.x, this.aim.offset.y)
    this.aimInputs?.updatePowerSlider(this.aim.power / this.maxPower)
    this.aimInputs?.updateElevationDisplay()
    this.aimInputs?.showOverlap()
  }

  moveTo(pos) {
    this.aim.pos.copy(pos)
    this.mesh.rotation.z = this.aim.angle
    this.helperMesh.rotation.z = this.aim.angle

    // Apply elevation angle to cue mesh (rotation around Y-axis for tilt)
    // Convert elevation from degrees to radians
    const elevationRad = (this.aim.elevation * Math.PI) / 180
    // Rotate cue stick to show elevation angle visually
    // Use rotation.y for tilting the cue up/down relative to aim direction
    this.mesh.rotation.y = -elevationRad  // Negative because mesh coordinate system

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
  }

  update(t) {
    this.t += t
    this.moveTo(this.aim.pos)
  }

  placeBallMode() {
    this.mesh.visible = false
    this.placerMesh.visible = true
    this.aim.angle = 0
  }

  aimMode() {
    this.mesh.visible = true
    this.placerMesh.visible = false
  }

  spinOffset() {
    return upCross(unitAtAngle(this.aim.angle))
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
}
