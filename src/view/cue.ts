import { TableGeometry } from "../view/tablegeometry"
import { Table } from "../model/table"
import { upCross, unitAtAngle, norm, atan2, sin } from "../utils/utils"
import { AimEvent } from "../events/aimevent"
import { AimInputs } from "./aiminputs"
import { Ball, State } from "../model/ball"
import { cueToSpin } from "../model/physics/physics"
import { CueMesh } from "./cuemesh"
import { Group, Material, Mesh, Quaternion, Raycaster, Vector3 } from "three"
import { R } from "../model/physics/constants"

export class Cue {
  mesh: Mesh
  helperMesh: Mesh
  placerMesh: Mesh
  hitPointMesh: Mesh  // 3D visualization of hit point on cue ball
  virtualCueMesh: Mesh  // Virtual cue stick showing exact hit direction and angle
  helperGhostGroup: Group
  private helperGhostBalls: Mesh[] = []
  private helperGhostMaterial?: Material | Material[]
  private helperGhostSourceGeometryId?: string
  private readonly helperGhostScale = 1
  private readonly helperGhostGapDiameterMultiplier = 2 // Gap between surfaces equals two diameters
  private lastHelperPoints: Vector3[] | null = null
  private lastHelperHasImpact = false
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
    this.helperGhostGroup = new Group()
    this.helperGhostGroup.visible = false
    this.helperGhostGroup.name = "helperGhostBalls"
    this.helperGhostGroup.renderOrder = this.helperMesh.renderOrder + 1
  }

  rotateAim(angle, table: Table) {
    this.aim.angle = this.aim.angle + angle
    // Only update helper rotation if using straight cylinder (not curved tube)
    if (!this.masseMode) {
      this.helperMesh.rotation.z = this.aim.angle
    }
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

    // Calculate velocity with elevation angle
    const horizontalVel = unitAtAngle(aim.angle).multiplyScalar(aim.power)

    if (this.masseMode && this.elevation > 0.2) {
      // In masse mode with high elevation, apply vertical component
      const horizontalMagnitude = aim.power * Math.cos(this.elevation)
      const verticalMagnitude = aim.power * Math.sin(this.elevation)
      ball.vel.copy(unitAtAngle(aim.angle).multiplyScalar(horizontalMagnitude))
      ball.vel.z = verticalMagnitude
    } else {
      // Normal shot - pure horizontal
      ball.vel.copy(horizontalVel)
      ball.vel.z = 0
    }

    ball.rvel.copy(cueToSpin(aim.offset, ball.vel))
    ball.magnusEnabled = this.masseMode
    ball.magnusElevation = this.elevation
    this.hitPointMesh.visible = false
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

    const baseDirection = unitAtAngle(this.aim.angle + Math.PI)
    let direction = new Vector3(baseDirection.x, baseDirection.y, 0)

    const horizontalAngle = -this.aim.offset.x * Math.PI / 2
    direction.applyAxisAngle(new Vector3(0, 0, 1), horizontalAngle)

    const verticalAngle = -this.aim.offset.y * Math.PI / 2
    const perpendicularAxis = upCross(baseDirection).normalize()
    direction.applyAxisAngle(perpendicularAxis, verticalAngle)

    const finalDirection = direction.normalize()
    const hitPointOnSurface = pos.clone().addScaledVector(finalDirection, R)

    const cueDirection = unitAtAngle(this.aim.angle + Math.PI)
    const cueDirection3D = new Vector3(
      cueDirection.x * Math.cos(this.elevation),
      cueDirection.y * Math.cos(this.elevation),
      Math.sin(this.elevation)
    ).normalize()

    const radiusInMM = 30.75
    const virtualCueHalfLength = (100 / radiusInMM) * R / 2
    const additionalOffset = (10 / radiusInMM) * R
    const cueClearance = 1.25 * 2 * R
    const totalOffset = virtualCueHalfLength + additionalOffset + cueClearance + cueClearance
    const swing = (sin(this.t + Math.PI / 2) - 1) * 2 * R * (this.aim.power / this.maxPower)
    const cuePosition = hitPointOnSurface.clone()
      .addScaledVector(cueDirection3D, totalOffset)
      .addScaledVector(cueDirection3D, swing)
    this.mesh.position.copy(cuePosition)

    const negativeYAxis = new Vector3(0, -1, 0)
    const quaternion = new Quaternion()
    quaternion.setFromUnitVectors(negativeYAxis, cueDirection3D)
    this.mesh.setRotationFromQuaternion(quaternion)

    // Only update helper position/rotation if using straight cylinder (not curved tube)
    if (!this.masseMode) {
      this.helperMesh.position.copy(pos)
      this.helperMesh.rotation.z = this.aim.angle
    }

    this.placerMesh.position.copy(pos)
    this.placerMesh.rotation.z = this.t

    this.updateHitPoint(pos)
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
    const hitPointPosition = ballPos.clone().addScaledVector(finalDirection, R * 0.05)
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
    if (!b) {
      this.hideHelperGhostBalls()
      return
    }
    this.updateHelperGhostBalls(this.lastHelperPoints, this.lastHelperHasImpact)
  }

  toggleHelper() {
    this.showHelper(!this.helperMesh.visible)
  }

  updateHelperCurve(trajectoryPoints: Vector3[] | null, hasImpact = false) {
    this.lastHelperPoints = trajectoryPoints
      ? trajectoryPoints.map((p) => p.clone())
      : null
    this.lastHelperHasImpact = hasImpact
    if (this.masseMode && trajectoryPoints && trajectoryPoints.length > 2) {
      // Update helper to follow curved trajectory
      CueMesh.updateHelperGeometry(this.helperMesh, trajectoryPoints)
      // Reset position/rotation for tube geometry (it's already positioned by points)
      this.helperMesh.position.set(0, 0, 0)
      this.helperMesh.rotation.set(0, 0, 0)
    } else {
      // Revert to straight helper
      CueMesh.updateHelperGeometry(this.helperMesh, null)
      // Restore normal position/rotation for straight helper
      this.helperMesh.position.copy(this.aim.pos)
      this.helperMesh.rotation.z = this.aim.angle
    }
    this.updateHelperGhostBalls(this.lastHelperPoints, hasImpact)
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

    this.helperGhostMaterial = undefined
    this.helperGhostSourceGeometryId = undefined
    this.helperGhostGroup.visible = false
  }

  private configureGhostMaterial<T extends Material>(material: T): T {
    const configured = material as any
    if ("transparent" in configured) {
      configured.transparent = true
    }
    if ("opacity" in configured) {
      configured.opacity = 0.3
    }
    if ("depthWrite" in configured) {
      configured.depthWrite = true
    }
    if ("depthTest" in configured) {
      configured.depthTest = true
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

  private cloneGhostMaterial(material: Material | Material[]): Material | Material[] {
    if (Array.isArray(material)) {
      return material.map((mat) => this.configureGhostMaterial(mat.clone()))
    }
    return this.configureGhostMaterial(material.clone())
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
      this.helperGhostMaterial = this.cloneGhostMaterial(cueBallMesh.material)
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
    const helperLength = (R * 30) / 0.5
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
    hasImpact: boolean
  ) {
    if (!this.helperMesh.visible) {
      this.hideHelperGhostBalls()
      return
    }

    let effectivePoints = trajectoryPoints
    let effectiveImpact = hasImpact

    if (!effectivePoints || effectivePoints.length < 2) {
      effectivePoints = this.generateStraightHelperPoints()
      effectiveImpact = false
    }

    if (!effectivePoints || effectivePoints.length < 2) {
      this.hideHelperGhostBalls()
      return
    }

    if (!this.ensureHelperGhostResources()) {
      this.hideHelperGhostBalls()
      return
    }

    const baseRadius = this.container?.table?.cueball?.radius ?? R
    const ghostRadius = baseRadius * this.helperGhostScale
    const gapDistance = (this.helperGhostGapDiameterMultiplier * 2 * baseRadius)
    const spacing = Math.max(ghostRadius * 2 + gapDistance, 1e-6)
    const positions = this.computeGhostBallPositions(effectivePoints, spacing)

    if (positions.length === 0) {
      this.hideHelperGhostBalls()
      return
    }

    this.ensureHelperGhostCount(positions.length)

    for (let i = 0; i < this.helperGhostBalls.length; i++) {
      const ball = this.helperGhostBalls[i]
      if (i < positions.length) {
        ball.position.copy(positions[i])
        ball.visible = true
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

  toggleMasseMode() {
    this.masseMode = !this.masseMode
    if (!this.masseMode) {
      const offset = this.aim.offset.clone()
      if (offset.length() > this.offCenterLimit) {
        offset.normalize().multiplyScalar(this.offCenterLimit)
        this.aim.offset.copy(offset)
      }
      this.elevation = this.defaultElevation
      // Reset to straight helper
      this.updateHelperCurve(null)
    } else {
      // Show helper when entering massé mode
      this.helperMesh.visible = true
    }
    this.updateAimInput()
    this.container?.updateTrajectoryPrediction()
    return this.masseMode
  }

  setMassePreset(angleDegrees: number, direction: 'left' | 'right') {
    this.masseMode = true
    const angleRad = (angleDegrees * Math.PI) / 180
    const normalizedAngle = angleRad / (Math.PI / 2)
    const offsetY = normalizedAngle * 0.75
    const offsetX = direction === 'right' ? 0.5 : -0.5

    this.aim.offset.set(offsetX, offsetY, 0)
    if (this.aim.offset.length() > this.offCenterLimitMasse) {
      this.aim.offset.normalize().multiplyScalar(this.offCenterLimitMasse)
    }

    this.elevation = angleRad
    this.aim.power = this.maxPower * 0.35

    // Show helper when preset is selected
    this.helperMesh.visible = true

    this.updateAimInput()
    this.container?.updateTrajectoryPrediction()
  }
}

