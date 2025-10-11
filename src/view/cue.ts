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
  readonly offCenterLimitMasse = 0.8  // Increased limit for massé shots
  readonly maxPower = 160 * R
  t = 0
  aimInputs: AimInputs
  aim: AimEvent = new AimEvent()
  container: any // Container reference for trajectory updates
  masseMode: boolean = false  // Toggle for massé mode

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

  toggleMasseMode() {
    this.masseMode = !this.masseMode
    // Reapply current offset to ensure it's within new limits
    if (!this.masseMode) {
      const offset = this.aim.offset.clone()
      if (offset.length() > this.offCenterLimit) {
        offset.normalize().multiplyScalar(this.offCenterLimit)
        this.aim.offset.copy(offset)
        this.updateAimInput()
      }
    }
    this.container?.updateTrajectoryPrediction()
    return this.masseMode
  }

  setMassePreset(angleDegrees: number, direction: 'left' | 'right') {
    // Enable massé mode
    this.masseMode = true

    // Calculate offset based on angle (from HTML reference model)
    const angleRad = (angleDegrees * Math.PI) / 180
    const offsetY = Math.sin(Math.PI / 2 - angleRad)

    // Set horizontal offset for spin direction
    // Using 0.5 for moderate side spin (reduced from 0.7 to avoid excessive spin)
    // The cueToSpin formula is very sensitive to offset magnitude
    const offsetX = direction === 'right' ? 0.5 : -0.5

    // Set the offset
    this.aim.offset.set(offsetX, offsetY, 0)

    // Ensure within massé limits
    if (this.aim.offset.length() > this.offCenterLimitMasse) {
      this.aim.offset.normalize().multiplyScalar(this.offCenterLimitMasse)
    }

    // Set preset power to 35% of max for controlled massé shots
    this.aim.power = this.maxPower * 0.35

    this.updateAimInput()
    this.container?.updateTrajectoryPrediction()
  }
}
