import { TableGeometry } from "../view/tablegeometry"
import { Table } from "../model/table"
import { upCross, unitAtAngle, norm, atan2, sin } from "../utils/utils"
import { AimEvent } from "../events/aimevent"
import { AimInputs } from "./aiminputs"
import { Ball, State } from "../model/ball"
import { cueToSpin, cueToSpinUniversal, DEBUG_PHYSICS, addDebugVelocityArrow } from "../model/physics/physics"
import { CueMesh } from "./cuemesh"
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Group,
  Material,
  Mesh,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  ShaderMaterial,
  Vector3,
} from "three"
import { R } from "../model/physics/constants"
import { applyShotKinematics } from "../model/physics/shot"
import { applyShotFromPose } from "../model/physics/shot"
import { makeShotPoseFromAim } from "../model/physics/shot"
import { ENGINE_DT } from "../model/physics/engine"
import { trace } from "../utils/trace"

export class Cue {
  mesh: Mesh
  placerMesh: Mesh
  hitPointMesh: Mesh  // 3D visualization of hit point on cue ball
  virtualCueMesh: Mesh  // Virtual cue stick showing exact hit direction and angle
  helperGhostGroup: Group
  private helperGhostBalls: Mesh[] = []
  private helperGhostMaterial?: Material | Material[]
  private helperImpactGhostMaterial?: Material | Material[]
  private helperGhostSourceGeometryId?: string
  private helperVisible = false
  private readonly helperGhostScale = 1
  private readonly helperGhostGapDiameterMultiplier = 2 // Gap between surfaces equals two diameters
  private lastHelperPoints: Vector3[] | null = null
  private lastHelperHasImpact = false
  private lastHelperImpactIsBall = false
  readonly offCenterLimitMasse = 0.8  // Increased limit for masse shots
  readonly ballRadius: number  // Ball radius for this game mode
  readonly maxPower: number    // Maximum power based on ball radius
  readonly defaultElevation = 0.17  // Default cue elevation (radians)
  t = 0
  aimInputs: AimInputs
  aim: AimEvent = new AimEvent()
  container: any // Container reference for trajectory updates
  readonly masseMode = true  // masse mode always active
  elevation: number = 0.17  // Current cue elevation angle in radians

  length = TableGeometry.tableX * 1

  constructor(container?: any, ballRadius?: number, headless?: boolean) {
    this.container = container
    // Use provided ball radius, or fall back to global R for backward compatibility
    this.ballRadius = ballRadius ?? R
    this.maxPower = 160 * this.ballRadius
    if (headless) {
      // Do not create heavy geometries/materials in headless mode
      this.mesh = undefined as any
      this.placerMesh = undefined as any
      this.hitPointMesh = undefined as any
      this.virtualCueMesh = undefined as any
      this.helperGhostGroup = new Group()
      this.helperGhostGroup.visible = false
      this.helperGhostGroup.name = "helperGhostBalls"
      this.helperGhostGroup.renderOrder = 0
    } else {
      this.mesh = CueMesh.createCue(
        (this.ballRadius * 0.05) / 0.5,
        (this.ballRadius * 0.15) / 0.5,
        this.length
      )
      this.placerMesh = CueMesh.createPlacer()
      this.hitPointMesh = CueMesh.createHitPoint()
      this.virtualCueMesh = CueMesh.createVirtualCue()
      this.helperGhostGroup = new Group()
      this.helperGhostGroup.visible = false
      this.helperGhostGroup.name = "helperGhostBalls"
      this.helperGhostGroup.renderOrder = 0
    }
  }

  rotateAim(angle, table: Table) {
    this.aim.angle = this.aim.angle + angle
    this.aimInputs.showOverlap()
    this.avoidCueTouchingOtherBall(table)
    this.container?.updateTrajectoryPrediction()
  }

  adjustPower(delta) {
    this.aim.power = Math.min(this.maxPower, this.aim.power + delta)
    this.updateAimInput()
    this.container?.updateTrajectoryPrediction()
  }

  setPower(value: number | string) {
    const numericValue =
      typeof value === "number" ? value : parseFloat(value)
    if (!Number.isFinite(numericValue)) {
      return
    }
    const clamped = Math.max(0, numericValue)
    this.aim.power = clamped * this.maxPower
    this.container?.updateTrajectoryPrediction()
  }

  hit(ball: Ball) {

    const aim = this.aim
    this.t = 0
    ball.state = State.Sliding

    // Build exact shot pose from aim/elevation (mesh-free parity with predictor)
    const pose = makeShotPoseFromAim(
      ball,
      { angle: this.aim.angle, offset: this.aim.offset, power: this.aim.power },
      this.elevation
    )

    // Trace shot pose for parity validation (use trace helper)
    const shotId = (typeof performance !== 'undefined' ? Math.round(performance.now()) : Date.now())
    const tableState = (this.container && this.container.table && this.container.table.serialise) ? this.container.table.serialise() : undefined
    trace("shot", {
      shotId: shotId,
      ballId: ball.id,
      pos: { x: ball.pos.x, y: ball.pos.y, z: ball.pos.z },
      aim: { angle: this.aim.angle, offset: { x: this.aim.offset.x, y: this.aim.offset.y, z: this.aim.offset.z }, power: this.aim.power },
      elevation: this.elevation,
      cueDir: { x: pose.cueDir.x, y: pose.cueDir.y, z: pose.cueDir.z },
      hitPointWorld: { x: pose.hitPointWorld.x, y: pose.hitPointWorld.y, z: pose.hitPointWorld.z },
      engineDt: ENGINE_DT,
      table: tableState,
      tableGeometry: { tableX: TableGeometry.tableX, tableY: TableGeometry.tableY, X: TableGeometry.X, Y: TableGeometry.Y, hasPockets: TableGeometry.hasPockets }
    })

    applyShotFromPose(ball, pose)

    // Set shotId and cueBallId in container for event logging
    if (this.container) {
      this.container.currentShotId = shotId
      this.container.currentCueBallId = ball.id
    }

    // DEBUG: Add black arrow showing velocity direction (WITHOUT pause)
    if (this.container && DEBUG_PHYSICS) {
      addDebugVelocityArrow(this.container.view.scene, pose.hitPointWorld, ball.vel, this.ballRadius)
    }

    this.hitPointMesh.visible = false
    this.mesh.visible = false // Hide cue stick after shot
    this.container?.trajectoryRenderer?.clearTrajectories()

    // Raise camera height and move backward beyond table edge (simulates standing up)
    if (this.container?.view?.camera) {
      const camera = this.container.view.camera
      camera.raiseHeightForTracking(this.ballRadius)

      // Move camera beyond nearest table edge (only if inside table bounds)
      const cameraPos = camera.camera.position.clone()
      const tableX = TableGeometry.tableX
      const tableY = TableGeometry.tableY

      // Check if camera is inside table bounds
      if (Math.abs(cameraPos.x) < tableX && Math.abs(cameraPos.y) < tableY) {
        // Calculate distance to move beyond table edge
        camera.moveBackwardToTableEdge(cameraPos, tableX, tableY, this.ballRadius)
      }
    }
  }

  /**
   * Calculate actual hit offset from visual hit point indicator geometry.
   * This method extracts the hit point from the visual mesh position and converts
   * it to the offset coordinate system expected by cueToSpin().
   *
   * The approach:
   * 1. Get the 3D direction from ball center to hit point mesh
   * 2. Project this direction onto the cue's reference frame axes
   * 3. Return normalized offset coordinates [-1, 1] for physics
   *
   * This eliminates coordinate transformation issues at high elevations by
   * directly reading the visual representation that the user sees.
   */
  getActualHitOffset(ballPos: Vector3): Vector3 {
    // Read the mesh position and project it onto CUE's reference frame,
    // not the table's reference frame. This is crucial for elevated shots.

    const hitPointWorldPos = this.hitPointMesh.position.clone()
    const directionFromCenter = hitPointWorldPos.clone().sub(ballPos)
    const hitDirection = directionFromCenter.normalize()

    // Cue reference frame
    const aimDirection = unitAtAngle(this.aim.angle)
    const rightAxis = upCross(aimDirection).normalize()

    // Forward axis: cue direction with elevation
    const forwardAxis = new Vector3(aimDirection.x, aimDirection.y, 0).normalize()
    forwardAxis.applyAxisAngle(rightAxis, -this.elevation)

    // Up axis: perpendicular to cue direction (cue's vertical)
    // Use forwardAxis Ã— rightAxis to get upward direction
    const upAxisCue = new Vector3().crossVectors(forwardAxis, rightAxis).normalize()

    // Project the hit direction onto cue reference axes
    const horizontalOffset = hitDirection.dot(rightAxis)
    const verticalOffset = hitDirection.dot(upAxisCue)

    return new Vector3(horizontalOffset, verticalOffset, 0)
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
    this.aim.offset.copy(offset)
    this.avoidCueTouchingOtherBall(table)
    this.updateAimInput()
    this.container?.updateTrajectoryPrediction()
  }

  avoidCueTouchingOtherBall(table: Table) {
    const limit = this.offCenterLimitMasse
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
    this.aimInputs?.updateElevationSlider(this.elevation)
    this.aimInputs?.showOverlap()
  }

  moveTo(pos) {
    this.aim.pos.copy(pos)

    const baseDirection = unitAtAngle(this.aim.angle + Math.PI)
    let direction = new Vector3(baseDirection.x, baseDirection.y, 0)

    const horizontalAngle = -this.aim.offset.x * Math.PI / 2
    direction.applyAxisAngle(new Vector3(0, 0, 1), horizontalAngle)

    const verticalAngle = -this.aim.offset.y * Math.PI / 2
    const perpendicularAxis = upCross(baseDirection).normalize()
    direction.applyAxisAngle(perpendicularAxis, verticalAngle)

    const finalDirection = direction.normalize()
    const hitPointOnSurface = pos.clone().addScaledVector(finalDirection, this.ballRadius)

    const cueDirection = unitAtAngle(this.aim.angle + Math.PI)
    const cueDirection3D = new Vector3(
      cueDirection.x * Math.cos(this.elevation),
      cueDirection.y * Math.cos(this.elevation),
      Math.sin(this.elevation)
    ).normalize()

    const radiusInMM = 30.75
    const virtualCueHalfLength = (100 / radiusInMM) * this.ballRadius / 2
    const additionalOffset = (10 / radiusInMM) * this.ballRadius
    const cueClearance = 1.25 * 2 * this.ballRadius
    const totalOffset = virtualCueHalfLength + additionalOffset + cueClearance + cueClearance
    const swing = (sin(this.t + Math.PI / 2) - 1) * 2 * this.ballRadius * (this.aim.power / this.maxPower)
    const cuePosition = hitPointOnSurface.clone()
      .addScaledVector(cueDirection3D, totalOffset)
      .addScaledVector(cueDirection3D, swing)
    this.mesh.position.copy(cuePosition)

    const negativeYAxis = new Vector3(0, -1, 0)
    const quaternion = new Quaternion()
    quaternion.setFromUnitVectors(negativeYAxis, cueDirection3D)
    this.mesh.setRotationFromQuaternion(quaternion)

    this.placerMesh.position.copy(pos)
    this.placerMesh.rotation.z = this.t

    this.updateHitPoint(pos)
    this.updateVirtualCue(pos)
  }

  updateHitPoint(ballPos: Vector3) {
    // Use arcsin to convert normalized offset to proper rotation angle
    const baseDirection = unitAtAngle(this.aim.angle + Math.PI)
    let direction = new Vector3(baseDirection.x, baseDirection.y, 0)

    // Convert normalized offset to angle using arcsin
    // offset [-1,1] maps to angle [-Ï€/2, Ï€/2]
    const horizontalAngle = -Math.asin(Math.max(-1, Math.min(1, this.aim.offset.x)))
    direction.applyAxisAngle(new Vector3(0, 0, 1), horizontalAngle)

    const verticalAngle = -Math.asin(Math.max(-1, Math.min(1, this.aim.offset.y)))
    const perpendicularAxis = upCross(baseDirection).normalize()
    direction.applyAxisAngle(perpendicularAxis, verticalAngle)

    const finalDirection = direction.normalize()

    // Position mesh exactly on ball surface for accurate physics
    const hitPointPosition = ballPos.clone().addScaledVector(finalDirection, this.ballRadius)
    this.hitPointMesh.position.copy(hitPointPosition)

    const quaternion = new Quaternion()
    quaternion.setFromUnitVectors(new Vector3(0, 0, 1), finalDirection)
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
    const hitPointOnSurface = ballPos.clone().addScaledVector(finalDirection, this.ballRadius)

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
    this.hitPointMesh.visible = false
    this.aim.angle = 0
  }

  aimMode() {
    this.mesh.visible = true
    this.placerMesh.visible = false
    this.virtualCueMesh.visible = false
    this.hitPointMesh.visible = true
  }

  spinOffset() {
    return upCross(unitAtAngle(this.aim.angle)).clone()
      .multiplyScalar(this.aim.offset.x * 2 * this.ballRadius)
      .setZ(this.aim.offset.y * 2 * this.ballRadius)
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

  showHelper(visible: boolean) {
    this.helperVisible = visible
    if (!visible) {
      this.hideHelperGhostBalls()
      return
    }
    this.updateHelperGhostBalls(this.lastHelperPoints, this.lastHelperHasImpact, this.lastHelperImpactIsBall)
  }

  toggleHelper() {
    this.showHelper(!this.helperVisible)
  }

  updateHelperCurve(trajectoryPoints: Vector3[] | null, hasImpact = false, impactIsBall = false) {
    this.lastHelperPoints = trajectoryPoints
      ? trajectoryPoints.map((p) => p.clone())
      : null
    this.lastHelperHasImpact = hasImpact
    this.lastHelperImpactIsBall = impactIsBall
    if (!this.helperVisible) {
      this.hideHelperGhostBalls()
      return
    }
    this.updateHelperGhostBalls(this.lastHelperPoints, hasImpact, impactIsBall)
  }

  private disposeHelperGhostResources() {
    this.helperGhostBalls.forEach((ball) => {
      ball.geometry.dispose()
      this.helperGhostGroup.remove(ball)
    })
    this.helperGhostBalls = []

    if (this.helperGhostMaterial) {
      if (Array.isArray(this.helperGhostMaterial)) {
        this.helperGhostMaterial.forEach((mat) => mat.dispose())
      } else {
        this.helperGhostMaterial.dispose()
      }
    }

    if (this.helperImpactGhostMaterial) {
      if (Array.isArray(this.helperImpactGhostMaterial)) {
        this.helperImpactGhostMaterial.forEach((mat) => mat.dispose())
      } else {
        this.helperImpactGhostMaterial.dispose()
      }
    }

    this.helperGhostMaterial = undefined
    this.helperImpactGhostMaterial = undefined
    this.helperGhostSourceGeometryId = undefined
    this.helperGhostGroup.visible = false
  }

  private configureGhostMaterial<T extends Material>(material: T, isImpactBall = false): T {
    const configured = material as any
    if ("transparent" in configured) {
      configured.transparent = true
    }
    if ("opacity" in configured) {
      // Impact ball has less transparency (more visible)
      configured.opacity = isImpactBall ? 0.6 : 0.3
    }
    if ("depthWrite" in configured) {
      configured.depthWrite = !isImpactBall
    }
    if ("depthTest" in configured) {
      // Impact ball renders on top of everything
      configured.depthTest = !isImpactBall
    }
    if ("color" in configured && configured.color?.clone) {
      const colorClone = configured.color.clone()
      if (colorClone.offsetHSL) {
        colorClone.offsetHSL(0, -0.2, 0.15)
      }
      configured.color.copy(colorClone)
    }
    if ("emissive" in configured && configured.emissive?.clone) {
      const emissiveClone = configured.emissive.clone()
      if (emissiveClone.offsetHSL) {
        emissiveClone.offsetHSL(0, -0.15, 0.2)
      }
      configured.emissive.copy(emissiveClone)
      if ("emissiveIntensity" in configured) {
        configured.emissiveIntensity = Math.max(configured.emissiveIntensity ?? 0.35, 0.35)
      }
    }
    material.needsUpdate = true
    return material
  }

  private cloneGhostMaterial(material: Material | Material[], isImpactBall = false): Material | Material[] {
    if (Array.isArray(material)) {
      return material.map((mat) => this.configureGhostMaterial(mat.clone(), isImpactBall))
    }
    return this.configureGhostMaterial(material.clone(), isImpactBall)
  }

  private ensureHelperGhostResources(): boolean {
    const cueBallMesh = this.container?.table?.cueball?.ballmesh?.mesh
    if (!cueBallMesh) {
      return false
    }

    const geometryId = cueBallMesh.geometry.uuid
    if (
      this.helperGhostSourceGeometryId &&
      this.helperGhostSourceGeometryId !== geometryId
    ) {
      this.disposeHelperGhostResources()
    }

    if (!this.helperGhostMaterial) {
      this.helperGhostMaterial = this.cloneGhostMaterial(cueBallMesh.material, false)
      this.helperImpactGhostMaterial = this.cloneGhostMaterial(cueBallMesh.material, true)
      this.helperGhostSourceGeometryId = geometryId
    } else if (!this.helperGhostSourceGeometryId) {
      this.helperGhostSourceGeometryId = geometryId
    }

    return !!this.helperGhostMaterial
  }

  private ensureHelperGhostCount(count: number) {
    const cueBallMesh = this.container?.table?.cueball?.ballmesh?.mesh
    if (!cueBallMesh || !this.helperGhostMaterial) {
      return
    }

    while (this.helperGhostBalls.length < count) {
      const geometry = cueBallMesh.geometry.clone()
      const sharedMaterial = this.helperGhostMaterial
      const materialForMesh = Array.isArray(sharedMaterial)
        ? sharedMaterial.slice()
        : sharedMaterial
      const ghostBall = new Mesh(geometry, materialForMesh)
      ghostBall.visible = false
      ghostBall.castShadow = false
      ghostBall.receiveShadow = false
      ghostBall.name = `helperGhostBall-${this.helperGhostBalls.length}`
      ghostBall.renderOrder = this.helperGhostGroup.renderOrder + 1
      ghostBall.scale.setScalar(this.helperGhostScale)
      this.helperGhostGroup.add(ghostBall)
      this.helperGhostBalls.push(ghostBall)
    }
  }


  private generateStraightHelperPoints(): Vector3[] | null {
    const cueBall = this.container?.table?.cueball
    if (!cueBall) {
      return null
    }

    const direction = unitAtAngle(this.aim.angle)
    if (direction.lengthSq() === 0) {
      return null
    }

    const normalizedDirection = direction.setZ(0).normalize()
    const start = cueBall.pos.clone()
    const helperLength = (this.ballRadius * 30) / 0.5
    const end = start.clone().addScaledVector(normalizedDirection, helperLength)

    return [start, end]
  }

  private computeGhostBallPositions(points: Vector3[], spacing: number): Vector3[] {
    if (points.length < 2 || spacing <= 0) {
      return []
    }

    const positions: Vector3[] = []
    let accumulated = 0
    let nextDistance = spacing

    for (let i = 1; i < points.length; i++) {
      const start = points[i - 1]
      const end = points[i]
      const segment = end.clone().sub(start)
      const segmentLength = segment.length()
      if (segmentLength === 0) {
        continue
      }

      while (accumulated + segmentLength >= nextDistance) {
        const remaining = nextDistance - accumulated
        const ratio = remaining / segmentLength
        const position = start.clone().addScaledVector(segment, ratio)
        positions.push(position)
        nextDistance += spacing

        if (positions.length > 256) {
          return positions
        }
      }

      accumulated += segmentLength
    }

    return positions
  }

  private hideHelperGhostBalls() {
    this.helperGhostBalls.forEach((ball) => {
      ball.visible = false
    })
    this.helperGhostGroup.visible = false
  }

  private updateHelperGhostBalls(
    trajectoryPoints: Vector3[] | null,
    hasImpact: boolean,
    impactIsBall: boolean
  ) {

    if (!this.helperVisible) {
      this.hideHelperGhostBalls()
      return
    }

    let effectivePoints = trajectoryPoints
    let effectiveImpact = hasImpact
    let effectiveBallImpact = impactIsBall

    if (!effectivePoints || effectivePoints.length < 2) {
      effectivePoints = this.generateStraightHelperPoints()
      effectiveImpact = false
      effectiveBallImpact = false
    }

    if (!effectiveImpact) {
      effectiveBallImpact = false
    }

    if (!this.ensureHelperGhostResources()) {
      this.hideHelperGhostBalls()
      return
    }

    const baseRadius = this.container?.table?.cueball?.radius ?? this.ballRadius
    const ghostRadius = baseRadius * this.helperGhostScale
    const gapDistance = (this.helperGhostGapDiameterMultiplier * 2 * baseRadius)
    const spacing = Math.max(ghostRadius * 2 + gapDistance, 1e-6)
    const positions = this.computeGhostBallPositions(effectivePoints, spacing)

    if (effectiveImpact && effectivePoints.length > 0) {
      const impactPoint = effectivePoints[effectivePoints.length - 1]
      const lastPosition = positions[positions.length - 1]
      const impactAlreadyIncluded =
        lastPosition && lastPosition.distanceTo(impactPoint) <= 1e-4

      if (!impactAlreadyIncluded) {
        positions.push(impactPoint.clone())
      }

      if (positions.length >= 2) {
        const impactIndex = positions.length - 1
        const previousIndex = impactIndex - 1
        const previousPosition = positions[previousIndex]
        const distance = previousPosition.distanceTo(positions[impactIndex])
        const minSeparation = 2 * ghostRadius - 1e-6
        if (distance < minSeparation) {
          positions.splice(previousIndex, 1)
        }
      }
    }

    if (positions.length === 0) {
      this.hideHelperGhostBalls()
      return
    }

    this.ensureHelperGhostCount(positions.length)

    // Determine which ball is the last impact ball (if any)
    const lastImpactIndex = effectiveImpact && positions.length > 0 ? positions.length - 1 : -1

    for (let i = 0; i < this.helperGhostBalls.length; i++) {
      const ball = this.helperGhostBalls[i]
      if (i < positions.length) {
        ball.position.copy(positions[i])
        ball.visible = true

        // Apply special material to the last impact ghost ball
        const isLastImpactBall = i === lastImpactIndex
        const targetMaterial = isLastImpactBall ? this.helperImpactGhostMaterial : this.helperGhostMaterial

        if (targetMaterial && ball.material !== targetMaterial) {
          ball.material = Array.isArray(targetMaterial) ? targetMaterial.slice() : targetMaterial

          // Set higher render order for impact ball to render on top
          if (isLastImpactBall) {
            ball.renderOrder = this.helperGhostGroup.renderOrder + 10000
          } else {
            ball.renderOrder = this.helperGhostGroup.renderOrder + 1
          }
        }
      } else {
        ball.visible = false
      }
    }

    this.updateGhostBallRenderOrder()
    this.helperGhostGroup.visible = true
    this.lastHelperPoints = effectivePoints.map((p) => p.clone())
    this.lastHelperHasImpact = effectiveImpact
  }

  private updateGhostBallRenderOrder() {
    const camera = this.container?.view?.camera?.camera
    if (!camera) {
      return
    }

    this.helperGhostGroup.updateMatrixWorld(true)
    const baseOrder = this.helperGhostGroup.renderOrder + 1
    const worldPos = new Vector3()
    const visibleBalls = this.helperGhostBalls
      .map((mesh, index) => ({
        mesh,
        index,
        distanceSq: mesh.visible
          ? camera.position.distanceToSquared(mesh.getWorldPosition(worldPos))
          : Infinity,
      }))
      .filter((entry) => entry.mesh.visible && Number.isFinite(entry.distanceSq))
      .sort((a, b) => a.distanceSq - b.distanceSq)

    visibleBalls.forEach((entry, orderIndex) => {
      entry.mesh.renderOrder = baseOrder + orderIndex
    })

    const hiddenOrderStart = baseOrder + visibleBalls.length
    this.helperGhostBalls.forEach((mesh, index) => {
      if (!mesh.visible) {
        mesh.renderOrder = hiddenOrderStart + index
      }
    })
  }

  /**
   * Get helper ghost balls for camera adjustment
   */
  get ghostBalls(): Mesh[] {
    return this.helperGhostBalls
  }
}
