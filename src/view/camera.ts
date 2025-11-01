import { PerspectiveCamera, MathUtils, Vector3 } from "three"
import { up, zero, unitAtAngle } from "../utils/utils"
import { AimEvent } from "../events/aimevent"
import { CameraTop } from "./cameratop"
import { R } from "../model/physics/constants"

export class Camera {
  constructor(aspectRatio) {
    this.camera = new PerspectiveCamera(45, aspectRatio, R, R * 1000)
    // Initialize tracking lookAt to zero
    this.trackingLookAt.set(0, 0, 0)
    this.targetTrackingLookAt.set(0, 0, 0)
  }

  camera: PerspectiveCamera
  mode = this.topView
  private mainMode = this.aimView
  private height = R * 8
  private baseHeight = R * 8 // Base height for aim view
  private targetHeight = R * 8 // Target height for smooth transitions
  private aimDistance = R * 18 // Default aim camera distance
  private baseAimDistance = R * 18 // Base distance (zoom in limit)
  private targetAimDistance = R * 18 // Target distance for smooth transitions
  private rotationOffset = 0 // Camera rotation offset from aim angle (in radians)
  private targetRotationOffset = 0 // Target rotation offset for smooth transitions
  private trackingLookAt = new Vector3(0, 0, 0) // Dynamic lookAt target for ball tracking
  private targetTrackingLookAt = new Vector3(0, 0, 0) // Target lookAt position
  private backwardOffset = new Vector3(0, 0, 0) // Backward movement offset (simulates standing up)
  private targetBackwardOffset = new Vector3(0, 0, 0) // Target backward offset
  private lookAtHeightFactor = 0.5 // Multiplier for look-at Z offset (h * factor)
  private targetLookAtHeightFactor = 0.5 // Target multiplier for smooth transitions

  elapsed: number

  update(elapsed, aim: AimEvent, isNpcAnimating = false) {
    this.elapsed = elapsed
    // Use faster interpolation during NPC animation for smoother camera movement
    if (isNpcAnimating && this.mode === this.aimView) {
      this.aimView(aim, 0.35) // Much faster lerp during NPC animation
    } else {
      this.mode(aim)
    }
  }

  topView(_: AimEvent) {
    this.camera.fov = CameraTop.fov
    this.camera.position.lerp(
      CameraTop.viewPoint(this.camera.aspect, this.camera.fov),
      0.9
    )
    this.camera.up = up
    this.camera.lookAt(zero)
  }

  aimView(aim: AimEvent, fraction = 0.08) {
    // Smoothly interpolate height towards target (medium speed)
    this.height = MathUtils.lerp(this.height, this.targetHeight, 0.04)

    const h = this.height
    const portrait = this.camera.aspect < 0.8
    this.camera.fov = portrait ? 60 : 40
    if (h < 10 * R) {
      const factor = 100 * (10 * R - h)
      this.camera.fov -= factor * (portrait ? 3 : 1)
    }

    // Smoothly interpolate distance towards target
    this.aimDistance = MathUtils.lerp(this.aimDistance, this.targetAimDistance, 0.08)

    // Smoothly interpolate rotation offset
    this.rotationOffset = MathUtils.lerp(this.rotationOffset, this.targetRotationOffset, 0.08)

    // Smoothly interpolate lookAt target with higher vertical responsiveness
    // Vertical (screen up/down) adjustments feel faster by lerping Y 2x
    // Note: using component-wise lerp keeps X/Z smoothing unchanged
    this.trackingLookAt.set(
      MathUtils.lerp(this.trackingLookAt.x, this.targetTrackingLookAt.x, 0.08),
      MathUtils.lerp(this.trackingLookAt.y, this.targetTrackingLookAt.y, 0.16),
      MathUtils.lerp(this.trackingLookAt.z, this.targetTrackingLookAt.z, 0.08),
    )

    // Smoothly interpolate backward offset (simulates standing up movement)
    this.backwardOffset.lerp(this.targetBackwardOffset, 0.04)

    // Smoothly interpolate look-at height factor (tilt down to push ball up on screen)
    this.lookAtHeightFactor = MathUtils.lerp(this.lookAtHeightFactor, this.targetLookAtHeightFactor, 0.12)

    // Check if backward movement is complete (camera has moved outside table)
    const backwardMovementComplete = this.backwardOffset.length() > 0.1

    // Calculate camera position
    let basePos: Vector3
    if (backwardMovementComplete) {
      // Camera outside table: position is FIXED, only rotate (look around)
      // Use original aim angle without rotation offset
      basePos = aim.pos.clone()
        .addScaledVector(unitAtAngle(aim.angle), -this.aimDistance)
        .add(this.backwardOffset)
    } else {
      // Camera inside table: normal tracking with rotation offset
      const effectiveAngle = aim.angle + this.rotationOffset
      basePos = aim.pos.clone()
        .addScaledVector(unitAtAngle(effectiveAngle), -this.aimDistance)
        .add(this.backwardOffset)
    }

    this.camera.position.lerp(basePos, fraction)
    this.camera.position.z = h
    this.camera.up = up

    // Look at tracking target (blends between aim position and ball position)
    // Height bias: h * lookAtHeightFactor (default 0.5). Lowering factor tilts camera down
    const lookAtTarget = this.trackingLookAt.clone().addScaledVector(up, h * this.lookAtHeightFactor)
    this.camera.lookAt(lookAtTarget)
  }

  adjustHeight(delta) {
    delta = this.height < 10 * R ? delta / 8 : delta
    this.height = MathUtils.clamp(this.height + delta, R * 6, R * 120)
    if (this.height > R * 110) {
      this.suggestMode(this.topView)
    }
    if (this.height < R * 105) {
      this.suggestMode(this.aimView)
    }
  }

  suggestMode(mode) {
    if (this.mainMode === this.aimView) {
      this.mode = mode
    }
  }

  forceMode(mode) {
    this.mode = mode
    this.mainMode = mode
  }

  forceMove(aim: AimEvent) {
    if (this.mode === this.aimView) {
      this.aimView(aim, 1)
    }
  }

  toggleMode() {
    if (this.mode === this.topView) {
      this.mode = this.aimView
    } else {
      this.mode = this.topView
    }
    this.mainMode = this.mode
  }

  /**
   * Adjust aim camera distance to fit ghost balls (zoom out only)
   * @param requiredDistance - The distance needed to show the target
   */
  adjustAimDistance(requiredDistance: number) {
    // Only allow zoom out (increase distance), never zoom in below base
    const newDistance = Math.max(this.baseAimDistance, requiredDistance)
    this.targetAimDistance = newDistance
  }

  /**
   * Reset aim distance to default
   */
  resetAimDistance() {
    this.targetAimDistance = this.baseAimDistance
  }

  /**
   * Get current aim distance for calculations
   */
  getCurrentAimDistance(): number {
    return this.aimDistance
  }

  /**
   * Get base aim distance (zoom in limit)
   */
  getBaseAimDistance(): number {
    return this.baseAimDistance
  }

  /**
   * Adjust camera rotation to follow ball movement
   * @param angleOffset - Rotation offset in radians
   * @param lookAtPos - World position to look at
   */
  adjustRotation(angleOffset: number, lookAtPos: Vector3) {
    this.targetRotationOffset = angleOffset
    this.targetTrackingLookAt.copy(lookAtPos)
  }

  /**
   * Reset camera rotation to center on aim
   */
  resetRotation(aimPos: Vector3) {
    this.targetRotationOffset = 0
    this.targetTrackingLookAt.copy(aimPos)
  }

  /**
   * Get current rotation offset
   */
  getCurrentRotationOffset(): number {
    return this.rotationOffset
  }

  /**
   * Adjust both distance and rotation for dynamic ball tracking
   * @param distance - Required camera distance
   * @param angleOffset - Rotation offset in radians
   * @param lookAtPos - Position to look at
   */
  adjustTrackingCamera(distance: number, angleOffset: number, lookAtPos: Vector3) {
    this.adjustAimDistance(distance)
    this.adjustRotation(angleOffset, lookAtPos)
  }

  /**
   * Reset all dynamic camera adjustments
   */
  resetDynamicAdjustments(aimPos: Vector3) {
    this.resetAimDistance()
    this.resetRotation(aimPos)
    this.resetHeight()
    this.resetBackwardOffset()
    this.resetLookAtHeightFactor()
  }

  /**
   * Raise camera height for ball tracking (10 ball diameters)
   * @param ballRadius - Ball radius to calculate height increase
   */
  raiseHeightForTracking(ballRadius: number) {
    const heightIncrease = 10 * 2 * ballRadius // 10 ball diameters
    // Raise from current height, not base height
    this.targetHeight = this.height + heightIncrease
  }

  /**
   * Reset camera height to base
   */
  resetHeight() {
    this.targetHeight = this.baseHeight
  }

  /**
   * Move camera backward beyond nearest table edge (simulates standing up)
   * @param cameraPos - Current camera position
   * @param tableX - Table half width
   * @param tableY - Table half height
   * @param ballRadius - Ball radius for additional clearance
   */
  moveBackwardToTableEdge(cameraPos: Vector3, tableX: number, tableY: number, ballRadius: number) {
    // Calculate distances to each edge
    const distToRight = tableX - cameraPos.x
    const distToLeft = tableX + cameraPos.x
    const distToTop = tableY - cameraPos.y
    const distToBottom = tableY + cameraPos.y

    // Find nearest edge and its distance
    const minDist = Math.min(distToRight, distToLeft, distToTop, distToBottom)

    // Determine direction to nearest edge
    let direction = new Vector3(0, 0, 0)
    if (minDist === distToRight) {
      direction.set(1, 0, 0) // Move right
    } else if (minDist === distToLeft) {
      direction.set(-1, 0, 0) // Move left
    } else if (minDist === distToTop) {
      direction.set(0, 1, 0) // Move up
    } else {
      direction.set(0, -1, 0) // Move down
    }

    // Calculate required distance: distance to edge + extra clearance
    // Extra clearance: base 3.5 diameters + extra 5 diameters after shot
    // Pull back stronger to reduce perceived jitter without increasing height
    const extraClearance = (3.5 + 5.0) * 2 * ballRadius
    const totalDistance = minDist + extraClearance

    // Set backward offset to move beyond table edge
    this.targetBackwardOffset.copy(direction.multiplyScalar(totalDistance))
  }

  /**
   * Reset backward offset
   */
  resetBackwardOffset() {
    this.targetBackwardOffset.set(0, 0, 0)
  }

  /**
   * Bias the look-at vertical tilt to keep important content higher on screen
   * @param factor Multiplier for h (0.2..0.6). Lower => tilt down more => ball appears higher
   */
  setLookAtHeightFactor(factor: number) {
    // clamp for stability
    const clamped = MathUtils.clamp(factor, 0.2, 0.6)
    this.targetLookAtHeightFactor = clamped
  }

  /** Reset look-at height factor to default (0.5) */
  resetLookAtHeightFactor() {
    this.targetLookAtHeightFactor = 0.5
  }
}
