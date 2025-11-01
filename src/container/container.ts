import { Input } from "../events/input"
import { GameEvent } from "../events/gameevent"
import { StationaryEvent } from "../events/stationaryevent"
import { Controller } from "../controller/controller"
import { Table } from "../model/table"
import { View } from "../view/view"
import { Init } from "../controller/init"
import { AimInputs } from "../view/aiminputs"
import { Keyboard } from "../events/keyboard"
import { Sound } from "../view/sound"
import { controllerName } from "../controller/util"
import { Chat } from "../view/chat"
import { ChatEvent } from "../events/chatevent"
import { Throttle } from "../events/throttle"
import { Sliders } from "../view/sliders"
import { trace } from "../utils/trace"
import { OutcomeType } from "../model/outcome"
import { Recorder } from "../events/recorder"
import { Rules } from "../controller/rules/rules"
import { RuleFactory } from "../controller/rules/rulefactory"
import { Menu } from "../view/menu"
import { Hud } from "../view/hud"
import { LobbyIndicator } from "../view/lobbyindicator"
import { ScoreButtons } from "../view/scorebuttons"
import { endShot, recordShotFrame } from "../utils/shotstats"
import { TrajectoryPredictor } from "../model/trajectorypredictor"
import { TrajectoryRenderer } from "../view/trajectoryrenderer"
import { Vector3 } from "three"
import { R, CAROM_PHYSICS } from "../model/physics/constants"
import { toggleDebugPhysics, removeDebugVelocityArrow } from "../model/physics/physics"
import { unitAtAngle, atan2 } from "../utils/utils"
import { CaromClothManager } from "../view/caromcloth"
import { ClothPanel } from "../view/clothpanel"
import { TableMesh } from "../view/tablemesh"
import { PrecisionPanel } from "../view/precisionpanel"
import { Cue } from "../view/cue"
// Physics parameters are now sourced only from src/model/physics/constants.ts

/**
 * Model, View, Controller container.
 */
const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now())
export class Container {
  table: Table
  view: View
  controller: Controller
  inputQueue: Input[] = []
  eventQueue: GameEvent[] = []
  keyboard: Keyboard
  sound: Sound
  chat: Chat
  sliders: Sliders
  recorder: Recorder
  id: string = ""
  isSinglePlayer: boolean = true
  rules: Rules
  menu: Menu
  hud: Hud
  lobbyIndicator: LobbyIndicator
  scoreButtons: ScoreButtons
  trajectoryPredictor: TrajectoryPredictor
  trajectoryRenderer: TrajectoryRenderer
  caromClothManager?: CaromClothManager
  clothPanel?: ClothPanel
  precisionPanel: PrecisionPanel
  frame: (timestamp: number) => void
  private wasMoving = false
  private debugModeEnabled = false
  private isPaused = false
  private pauseResumeCallback?: () => void
  private cameraControlsLocked = false
  private isNpcAnimating = false

  last = performance.now()
  readonly step = 0.001953125 * 1

  // Event logging for actual shots
  currentShotId?: number
  currentCueBallId?: number
  private processedOutcomes = 0
  private stopLogged = false
  // Distance tracking for current shot
  private shotLastPos?: Vector3
  private shotTotalDistance: number = 0

  broadcast: (event: GameEvent) => void = () => {}
  log: (text: string) => void

  constructor(element, log, assets, ruletype?, keyboard?, id?) {
    this.log = log
    this.scoreButtons = new ScoreButtons(this)
    this.rules = RuleFactory.create(ruletype, this)
    this.table = this.rules.table()
    if (this.rules.rulename === "threecushion") {
      this.table.cue = new Cue(undefined, CAROM_PHYSICS.R)
    }
    this.view = new View(element, this.table, assets)
    this.trajectoryPredictor = new TrajectoryPredictor()
    this.trajectoryRenderer = new TrajectoryRenderer(this.view.scene)
    // Initialize trajectories as hidden by default (they will be shown only when target button is active)
    this.trajectoryRenderer.setVisible(false)
    this.table.cue.container = this // Set container reference for trajectory updates
    this.table.cue.aimInputs = new AimInputs(this)
    this.keyboard = keyboard
    this.sound = assets.sound
    this.chat = new Chat(this.sendChat, this)
    this.sliders = new Sliders(undefined, this)
    this.debugModeEnabled = this.sliders.isVisible()
    this.view.setDebugMode(this.debugModeEnabled)
    this.table.showSpin(this.debugModeEnabled)
    this.table.showTraces(this.debugModeEnabled)
    this.table.showVirtualCue(this.debugModeEnabled)
    this.recorder = new Recorder(this)
    this.id = id
    this.menu = new Menu(this)
    this.table.addToScene(this.view.scene)
    if (this.rules.rulename === "threecushion") {
      const surfaces = TableMesh.caromSurfaces ?? null
      this.caromClothManager = new CaromClothManager(surfaces)
      this.clothPanel = new ClothPanel(this.caromClothManager)
      if (!surfaces) {
        setTimeout(() => {
          this.caromClothManager?.setSurfaces(TableMesh.caromSurfaces ?? null)
        }, 0)
      }
    }
    this.hud = new Hud()
    this.lobbyIndicator = new LobbyIndicator()
    this.precisionPanel = new PrecisionPanel(this)
    this.updateController(new Init(this))
    this.wasMoving = !this.table.allStationary()

    // Initial trajectory prediction for 3 cushion mode
    // Poll until balls are stationary, then update trajectory
    const ensureInitialTrajectory = () => {
      if (this.table.allStationary()) {
        this.updateTrajectoryPrediction()
      } else {
        requestAnimationFrame(ensureInitialTrajectory)
      }
    }
    requestAnimationFrame(ensureInitialTrajectory)

    // Debug mode: Enter key to resume from pause
    // Use capture phase to catch event before Keyboard class blocks it
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && this.isPaused) {
          this.resumePhysics()
          e.stopPropagation()
          e.preventDefault()
        }
      }, true) // useCapture = true
    }
  }
  lockCameraControls(lock: boolean) {
    this.cameraControlsLocked = !!lock
  }
  isCameraControlsLocked(): boolean {
    return this.cameraControlsLocked
  }
  setNpcAnimating(animating: boolean) {
    this.isNpcAnimating = !!animating
    // Disable/enable all user input controls during NPC animation
    if (animating) {
      this.keyboard?.disableDragControls?.()
      this.table?.cue?.aimInputs?.disableInputs?.()
    } else {
      this.keyboard?.enableDragControls?.()
      this.table?.cue?.aimInputs?.enableInputs?.()
    }
  }

  sendChat = (msg) => {
    this.sendEvent(new ChatEvent(this.id, msg))
  }

  throttle = new Throttle(0, (event) => {
    this.broadcast(event)
  })

  sendEvent(event) {
    this.throttle.send(event)
  }

  advance(elapsed) {
    this.frame?.(elapsed)

    const steps = Math.floor(elapsed / this.step)
    const computedElapsed = steps * this.step
    const stateBefore = this.table.allStationary()
    for (let i = 0; i < steps; i++) {
      this.table.advance(this.step)
    }

    // Log events for actual shots
    this.logShotEvents()

    this.table.updateBallMesh(computedElapsed)
    this.view.update(computedElapsed, this.table.cue.aim, this.isNpcAnimating)
    this.table.cue.update(computedElapsed)

    // Update dynamic camera tracking for moving balls
    this.updateDynamicCameraTracking()

    if (!stateBefore && this.table.allStationary()) {
      this.eventQueue.push(new StationaryEvent())
      this.updateTrajectoryPrediction()
      // Reset event logging when shot completes
      this.currentShotId = undefined
      this.currentCueBallId = undefined
      this.processedOutcomes = 0
      this.wasMoving = false
      this.stopLogged = false
      this.shotLastPos = undefined
      this.shotTotalDistance = 0
    }
    this.sound.processOutcomes(this.table.outcome)
  }

  private logShotEvents() {
    // Only log if we have a current shot
    if (this.currentShotId === undefined || this.currentCueBallId === undefined) {
      return
    }

    const cueBall = this.table.balls.find(b => b.id === this.currentCueBallId)
    if (!cueBall) return

    // Accumulate traveled distance during this shot (3D distance)
    if (!this.shotLastPos) {
      this.shotLastPos = cueBall.pos.clone()
    } else {
      const dx = cueBall.pos.x - this.shotLastPos.x
      const dy = cueBall.pos.y - this.shotLastPos.y
      const dz = cueBall.pos.z - this.shotLastPos.z
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (Number.isFinite(d) && d > 0) {
        this.shotTotalDistance += d
        this.shotLastPos.copy(cueBall.pos)
      }
    }

    // Process new outcomes
    const newOutcomes = this.table.outcome.slice(this.processedOutcomes)
    this.processedOutcomes = this.table.outcome.length

    newOutcomes.forEach(outcome => {
      if (outcome.type === OutcomeType.Collision) {
        const aId = outcome.ballA?.id
        const bId = outcome.ballB?.id
        if (aId === this.currentCueBallId || bId === this.currentCueBallId) {
          const other = aId === this.currentCueBallId ? (bId ?? null) : (aId ?? null)
          trace('event', {
            shotId: this.currentShotId,
            type: 'collision',
            t: this.last / 1000, // Convert to seconds
            pos: { x: cueBall.pos.x, y: cueBall.pos.y, z: cueBall.pos.z },
            otherBallId: other
          })
        }
      } else if (outcome.type === OutcomeType.Cushion) {
        const id = outcome.ballA?.id
        if (id === this.currentCueBallId) {
          trace('event', {
            shotId: this.currentShotId,
            type: 'cushion',
            t: this.last / 1000, // Convert to seconds
            pos: { x: cueBall.pos.x, y: cueBall.pos.y, z: cueBall.pos.z }
          })
        }
      }
    })

    // Detect stop
    if (cueBall.inMotion()) {
      this.wasMoving = true
    } else if (this.wasMoving && !this.stopLogged) {
      trace('event', {
        shotId: this.currentShotId,
        type: 'stop',
        t: this.last / 1000, // Convert to seconds
        pos: { x: cueBall.pos.x, y: cueBall.pos.y, z: cueBall.pos.z },
        distance: this.shotTotalDistance
      })
      this.stopLogged = true
    }
  }

  toggleDebugMode() {
    this.setDebugMode(!this.debugModeEnabled)
  }

  setDebugMode(enabled: boolean) {
    if (this.debugModeEnabled === enabled) {
      return
    }
    this.debugModeEnabled = enabled
    this.sliders.setVisible(enabled)
    this.table.showSpin(enabled)
    this.table.showTraces(enabled)
    this.table.showVirtualCue(enabled)
    this.view.setDebugMode(enabled)

    // Toggle debug physics mode (controls black arrow visibility)
    const debugPhysicsState = toggleDebugPhysics()
    console.log(`🔧 Debug Physics Mode: ${debugPhysicsState ? 'ENABLED' : 'DISABLED'} - Black arrow ${debugPhysicsState ? 'will appear' : 'hidden'} on next shot`)

    // If disabling debug mode, remove any existing debug arrow
    if (!enabled) {
      removeDebugVelocityArrow(this.view.scene)
    }
  }

  isDebugModeEnabled() {
    return this.debugModeEnabled
  }

  processEvents() {
    // Block keyboard inputs when paused (except Enter which is handled separately)
    if (this.keyboard && !this.isPaused) {
      const inputs = this.keyboard.getEvents()
      inputs.forEach((i) => this.inputQueue.push(i))
    }

    // Process input queue only when not paused
    if (!this.isPaused) {
      while (this.inputQueue.length > 0) {
        this.lastEventTime = this.last
        const input = this.inputQueue.shift()
        input && this.updateController(this.controller.handleInput(input))
      }
    }

    // only process events when stationary
    if (this.table.allStationary()) {
      const event = this.eventQueue.shift()
      if (event) {
        this.lastEventTime = performance.now()
        this.updateController(event.applyToController(this.controller))
      }
    }
  }

  lastEventTime = performance.now()

  animate(timestamp): void {
    const frameStart = now()
    const dt = (timestamp - this.last) / 1000
    const wasMoving = this.wasMoving
    const clampedDt = Math.max(dt, 0)

    const advanceStart = now()
    // Only advance physics if not paused
    if (!this.isPaused) {
      this.advance(clampedDt)
    }
    const advanceTime = now() - advanceStart
    this.last = timestamp

    const processStart = now()
    this.processEvents()
    const processTime = now() - processStart

    let renderTime = 0
    const needsRender =
      this.isNpcAnimating ||
      timestamp < this.lastEventTime + 12000 ||
      !this.table.allStationary() ||
      this.view.sizeChanged()
    if (needsRender) {
      const renderStart = now()
      this.view.render()
      renderTime = now() - renderStart
    }

    const frameTotal = now() - frameStart
    recordShotFrame({
      physics: advanceTime,
      process: processTime,
      render: renderTime,
      total: frameTotal,
      dtMs: clampedDt * 1000,
      rawElapsedMs: clampedDt * 1000,
      deltaMs: clampedDt * 1000,
      steps: 0,
      simulatedMs: clampedDt * 1000,
      accumulatorBefore: 0,
      accumulatorAfterAdd: 0,
      accumulatorAfter: 0,
      backlogBefore: 0,
      backlogAfter: 0,
      deltaClamped: false,
      accumulatorClamped: false,
      hitMaxSubSteps: false,
      accumulatorTrimmedPostStep: false,
    })

    const isMoving = !this.table.allStationary()
    if (wasMoving && !isMoving) {
      endShot()
    }
    // Close precision panel when shot is made (balls start moving)
    if (!wasMoving && isMoving) {
      this.precisionPanel?.hide()
    }
    this.wasMoving = isMoving

    // Update replay button state in aim mode
    // Disable when balls are moving, enable when stationary
    if (this.menu.replay && controllerName(this.controller) === "Aim") {
      this.menu.replay.disabled = isMoving
    }

    requestAnimationFrame((t) => {
      this.animate(t)
    })
  }

  updateController(controller) {
    if (controller !== this.controller) {
      this.log("Transition to " + controllerName(controller))
      this.controller = controller
      this.controller.onFirst()
    }
  }

  /**
   * Dynamic camera tracking for moving balls
   * Rotates camera to center ball on screen and raises height
   */
  private updateDynamicCameraTracking() {
    if (this.cameraControlsLocked) {
      return
    }
    // Only track in aim view mode
    if (this.view.camera.mode !== this.view.camera.aimView) {
      return
    }

    const aim = this.table.cue.aim

    // Only track when balls are moving
    if (this.table.allStationary()) {
      // Reset to default when balls stop
      this.view.camera.resetDynamicAdjustments(aim.pos)
      return
    }

    // Find balls in motion
    const movingBalls = this.table.balls.filter(ball => ball.inMotion())
    if (movingBalls.length === 0) {
      this.view.camera.resetDynamicAdjustments(aim.pos)
      return
    }

    // Use cue ball for tracking (or first moving ball)
    const trackBall = movingBalls.find(b => b === this.table.cueball) || movingBalls[0]

    // Convert ball position to screen space
    const screenPos = this.view.worldToScreen(trackBall.pos)

    // Compute bottom reserved margin in NDC based on panel height if present
    let panelHeightNdc = 0
    try {
      const panelEl = (typeof document !== 'undefined') ? document.querySelector('.panel') as HTMLElement : undefined
      const viewportHeight = this.view?.windowHeight || this.view?.element?.offsetHeight || 0
      if (panelEl && viewportHeight > 0) {
        panelHeightNdc = (2 * panelEl.offsetHeight) / viewportHeight
      }
    } catch (_) {
      // no-op: DOM may not be available in some contexts
    }

    // Effective visible vertical range: [yBottom, 1]
    const yBottom = -1 + panelHeightNdc
    const effectiveCenterY = (yBottom + 1) / 2 // Center of visible area

    // Calculate distance from effective screen center with higher vertical sensitivity
    const verticalSensitivity = 2.0 // 2x sensitivity for up/down
    const dyEff = (screenPos.y - effectiveCenterY) * verticalSensitivity
    const distanceFromCenter = Math.sqrt(screenPos.x * screenPos.x + dyEff * dyEff)

    // Threshold: 3 ball diameters from center in normalized coords
    const camera = this.view.camera.camera
    const ballRadius = trackBall.radius ?? R
    const fovRadians = (camera.fov * Math.PI) / 180
    const viewHeight = 2 * this.view.camera.getCurrentAimDistance() * Math.tan(fovRadians / 2)
    const ballDiameterInScreenSpace = (2 * ballRadius) / viewHeight
    let threshold = 3 * ballDiameterInScreenSpace

    // Safe line just above the panel with one extra ball diameter clearance
    const safeBottomY = yBottom + Math.min(2 * ballDiameterInScreenSpace, 0.3)

    if (distanceFromCenter > threshold) {
      // Ball is far from center, rotate camera gently to center it

      // Calculate direction from aim position to ball
      const toBall = trackBall.pos.clone().sub(aim.pos)
      const ballAngle = atan2(toBall.y, toBall.x)

      // Calculate angular difference from aim angle
      let angleDiff = ballAngle - aim.angle

      // Normalize angle difference to [-π, π]
      while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI
      while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI

      // Calculate blend factor based on distance from center
      // The farther from center, the more we rotate towards ball (gentle)
      const excessDistance = distanceFromCenter - threshold
      let blendFactor = Math.min(excessDistance / threshold, 1.0) * 0.7 // Max 70% rotation

      // Boost tracking when the ball is below the safe line (near bottom panel)
      if (screenPos.y < safeBottomY) {
        const shortfall = (safeBottomY - screenPos.y)
        // Scale boost relative to shortfall and keep bounded
        const boost = Math.min(1.0, shortfall * 2.0)
        blendFactor = Math.min(1.0, Math.max(blendFactor, blendFactor * (1 + boost)))
      }

      // Dampen tracking sensitivity when ball is fast and near frame center to reduce jitter
      // Estimate screen-space speed over a short preview interval
      const previewDt = 0.03 // 30 ms preview
      const predictedPos = trackBall.pos.clone().add(trackBall.vel.clone().multiplyScalar(previewDt))
      const screenNext = this.view.worldToScreen(predictedPos)
      const dxNdc = screenNext.x - screenPos.x
      const dyNdc = screenNext.y - screenPos.y
      const ndcDelta = Math.sqrt(dxNdc * dxNdc + dyNdc * dyNdc)
      // Speed factor: moving >6% of screen in 30ms counts as very fast
      const speedFactor = Math.max(0, Math.min(1, ndcDelta / 0.06))

      // Center weight: only dampen strongly near center, not near edges/panel
      const distToEdge = this.view.distanceToScreenEdge(screenPos)
      const centerWeight = Math.max(0, (distToEdge - 0.5) * 2) // 0 at <=0.5, 1 at 1.0

      // Apply dampening if not in panel danger zone
      if (screenPos.y >= safeBottomY) {
        const minScale = 0.35
        const dampen = 1 - (1 - minScale) * speedFactor * centerWeight
        blendFactor *= dampen
      }

      // Additional damping for distant balls (reduce wobble 2x for far targets not near edges)
      // Compute world-space planar distance in ball diameters
      const toBallPlanar = trackBall.pos.clone().sub(aim.pos)
      toBallPlanar.z = 0
      const planarDist = toBallPlanar.length()
      const diametersAway = (2 * (trackBall.radius ?? R)) > 0 ? (planarDist / (2 * (trackBall.radius ?? R))) : 0
      if (screenPos.y >= safeBottomY && distToEdge > 0.25) {
        // Start damping at 15 diameters, reach full 2x reduction by 30 diameters
        const far0 = 15
        const far1 = 30
        const farT = Math.max(0, Math.min(1, (diametersAway - far0) / (far1 - far0)))
        // Scale blend by up to 0.5 (2x reduction) as ball gets farther
        const farScale = 1 - 0.5 * farT
        blendFactor *= farScale
      }
      const rotationOffset = angleDiff * blendFactor

      // Blend lookAt target between aim position and ball position
      const lookAtTarget = aim.pos.clone().lerp(trackBall.pos, blendFactor)

      // Zoom out proportional to how far the ball is from center
      const distanceScale = 1.0 + (blendFactor * 0.5)
      const requiredDistance = this.view.camera.getBaseAimDistance() * distanceScale

      this.view.camera.adjustTrackingCamera(requiredDistance, rotationOffset, lookAtTarget)

      // Tilt camera down to lift the ball higher in the frame when near/under the panel-safe line
      if (screenPos.y < safeBottomY) {
        const shortfall = (safeBottomY - screenPos.y) // 0..~2
        // Map shortfall to a lower look-at height factor (0.5 -> ~0.25)
        const factor = Math.max(0.25, 0.5 - shortfall * 0.15)
        this.view.camera.setLookAtHeightFactor(factor)
      } else {
        this.view.camera.setLookAtHeightFactor(0.5)
      }
    } else {
      // Ball is near center, reset rotation and zoom back in if needed
      const currentDistance = this.view.camera.getCurrentAimDistance()
      const baseDistance = this.view.camera.getBaseAimDistance()

      // Gradually zoom back in to base distance
      if (currentDistance > baseDistance * 1.05) {
        this.view.camera.adjustAimDistance(baseDistance)
      } else {
        this.view.camera.resetAimDistance()
      }

      // Reset rotation gradually
      const currentRotation = this.view.camera.getCurrentRotationOffset()
      if (Math.abs(currentRotation) > 0.01) {
        // Gradually reduce rotation
        this.view.camera.adjustRotation(currentRotation * 0.5, aim.pos)
      } else {
        this.view.camera.resetRotation(aim.pos)
      }

      // Reset look-at height bias when centered region
      this.view.camera.setLookAtHeightFactor(0.5)

      // If ball is very fast near the center, pull camera back (increase distance) instead of raising height
      const previewDt = 0.03
      const predictedPos = trackBall.pos.clone().add(trackBall.vel.clone().multiplyScalar(previewDt))
      const screenNext = this.view.worldToScreen(predictedPos)
      const dxNdc = screenNext.x - screenPos.x
      const dyNdc = screenNext.y - screenPos.y
      const ndcDelta = Math.sqrt(dxNdc * dxNdc + dyNdc * dyNdc)
      const speedFactor = Math.max(0, Math.min(1, ndcDelta / 0.06))
      const distToEdge = this.view.distanceToScreenEdge(screenPos)
      const centerWeight = Math.max(0, (distToEdge - 0.5) * 2)

      if (centerWeight > 0.2 && speedFactor > 0.3) {
        const base = this.view.camera.getBaseAimDistance()
        // Back off up to +50% based on speed and centralness
        const backScale = 1 + 0.5 * speedFactor * centerWeight
        const desired = base * backScale
        this.view.camera.adjustAimDistance(desired)
      }
    }
  }

  /**
   * Adjust camera zoom to ensure last ghost ball is visible
   * Only zooms out, never zooms in beyond default
   */
  private adjustCameraForLastGhostBall() {
    // Only adjust in aim view mode
    if (this.view.camera.mode !== this.view.camera.aimView) {
      this.view.camera.resetAimDistance()
      return
    }

    // Get visible ghost balls
    const ghostBalls = this.table.cue.ghostBalls || []
    const visibleGhostBalls = ghostBalls.filter(ball => ball.visible)

    if (visibleGhostBalls.length === 0) {
      this.view.camera.resetAimDistance()
      return
    }

    // Get last visible ghost ball
    const lastGhostBall = visibleGhostBalls[visibleGhostBalls.length - 1]

    // Check if last ghost ball is in frustum
    const frustum = this.view.viewFrustrum()
    const isInView = frustum.intersectsObject(lastGhostBall)

    if (isInView) {
      // Ghost ball is visible, can reset to default distance
      this.view.camera.resetAimDistance()
      return
    }

    // Calculate required distance to fit the ghost ball
    const cueBallPos = this.table.cueball.pos
    const ghostBallPos = lastGhostBall.position
    const aim = this.table.cue.aim

    // Calculate distance from cue ball to last ghost ball
    const dx = ghostBallPos.x - cueBallPos.x
    const dy = ghostBallPos.y - cueBallPos.y
    const distanceToGhost = Math.sqrt(dx * dx + dy * dy)

    // Calculate required camera distance using viewport geometry
    // We need to ensure the ghost ball fits within the camera's view
    const camera = this.view.camera.camera
    const fovRadians = (camera.fov * Math.PI) / 180
    const aspectRatio = camera.aspect

    // Calculate visible width at ghost ball distance
    // Using field of view and aspect ratio to determine required distance
    const verticalFOV = fovRadians
    const horizontalFOV = 2 * Math.atan(Math.tan(verticalFOV / 2) * aspectRatio)

    // Add safety margin (1.3x) to ensure ghost ball is comfortably visible
    const safetyMargin = 1.3
    const requiredDistance = (distanceToGhost * safetyMargin) / Math.tan(horizontalFOV / 2)

    // Apply the distance (only if it's larger than current, i.e., zoom out only)
    this.view.camera.adjustAimDistance(requiredDistance)
  }

  updateTrajectoryPrediction() {
    // Check if targetButton is in active state
    const targetButton = document.getElementById("targetButton")
    const trajectoryVisible = targetButton?.classList.contains("is-active") ?? false

    // Only predict trajectories when balls are stationary
    if (!TrajectoryPredictor.shouldPredict(this) || !this.table.allStationary()) {
      this.trajectoryRenderer.clearTrajectories()
      this.table.cue.updateHelperCurve(null)
      this.view.camera.resetAimDistance()
      return
    }

    // Ensure power is set to a reasonable default if it's zero or too small
    if (this.table.cue.aim.power < 0.01) {
      this.table.cue.aim.power = this.table.cue.maxPower * 0.5 // Set to 50% power as default
    }

    // Always calculate trajectories (for helper curve), but control visibility separately
    try {
      // Pass massé mode state and elevation to trajectory predictor
      const masseMode = this.table.cue.masseMode
      const elevation = this.table.cue.elevation

      // Ensure aim.i is synchronized with current cue ball (critical for three-cushion mode)
      // This prevents predictor from using wrong ball when players alternate
      const activeCueBall = this.rules?.cueball ?? this.table.cueball
      this.table.cue.aim.i = this.table.balls.indexOf(activeCueBall)

      // Optimize: If trajectory lines are hidden, only predict short distance for helper
      const limitToHelper = !trajectoryVisible
      const predictions = this.trajectoryPredictor.predictTrajectory(
        this.table,
        this.table.cue.aim,
        this.rules,
        masseMode,
        elevation,
        limitToHelper
      )

      const helperMaxDistance = ((this.table.cueball?.radius ?? R) * 30) / 0.5
      const trimPointsByDistance = (points: Vector3[], maxDistance: number): Vector3[] => {
        if (points.length === 0) {
          return []
        }
        if (maxDistance <= 0) {
          return [points[0].clone()]
        }

        const trimmed: Vector3[] = [points[0].clone()]
        let accumulated = 0

        for (let i = 1; i < points.length; i++) {
          const prev = points[i - 1]
          const current = points[i]
          const segment = current.clone().sub(prev)
          const segmentLength = segment.length()
          if (segmentLength === 0) {
            continue
          }

          if (accumulated + segmentLength <= maxDistance) {
            trimmed.push(current.clone())
            accumulated += segmentLength
            continue
          }

          const remaining = maxDistance - accumulated
          if (remaining >= 0) {
            const interpolated = prev.clone().add(
              segment.multiplyScalar(remaining / segmentLength)
            )
            trimmed.push(interpolated)
          }
          break
        }

        if (trimmed.length < 2 && points.length >= 2) {
          trimmed.push(points[1].clone())
        }

        return trimmed
      }

      // Update helper curve to match trajectory prediction (always)
      if (predictions && predictions.length > 0) {
        // Find cue ball trajectory by matching ball ID
        // In three-cushion, cue ball can be yellow/white depending on turn
        // Prefer aim.i mapping if present to select the correct ball
        let cueBallId = this.table.cueball.id
        if (Number.isInteger(this.table.cue?.aim?.i)) {
          const idx = (this.table.cue.aim as any).i as number
          cueBallId = this.table.balls[idx]?.id ?? cueBallId
        }
        const cueBallTrajectory = predictions.find(p => p.ballId === cueBallId)

        if (cueBallTrajectory && cueBallTrajectory.points.length >= 2) {
          const trajectoryVectors = cueBallTrajectory.points.map(p =>
            new Vector3(p.position.x, p.position.y, p.position.z)
          )
          let helperPoints = trajectoryVectors
          if (
            cueBallTrajectory.firstImpactIndex !== undefined &&
            cueBallTrajectory.firstImpactIndex >= 0
          ) {
            const clampIndex = Math.min(
              cueBallTrajectory.firstImpactIndex + 1,
              trajectoryVectors.length
            )
            helperPoints = trajectoryVectors.slice(0, clampIndex)
          } else if (cueBallTrajectory.firstImpactDistance !== undefined) {
            const maxDistance = Math.min(
              cueBallTrajectory.firstImpactDistance,
              helperMaxDistance
            )
            helperPoints = trimPointsByDistance(trajectoryVectors, maxDistance)
          } else if (limitToHelper) {
            helperPoints = trimPointsByDistance(trajectoryVectors, helperMaxDistance)
          }

          const firstImpactDistance = cueBallTrajectory.firstImpactDistance
          const impactThreshold = helperMaxDistance - 1e-6
          const hasImpact =
            cueBallTrajectory.firstImpactIndex !== undefined ||
            (firstImpactDistance !== undefined && firstImpactDistance < impactThreshold)
          const hasBallImpact = predictions.some((p) =>
            p.ballId !== cueBallId && p.firstImpactIndex !== undefined
          )


          this.table.cue.updateHelperCurve(helperPoints, hasImpact, hasBallImpact)
        } else {
          this.table.cue.updateHelperCurve(null)
        }
      } else {
        this.table.cue.updateHelperCurve(null)
      }

      // Control trajectory lines visibility based on button state
      if (trajectoryVisible) {
        this.trajectoryRenderer.updateTrajectories(predictions, this.table)
        this.trajectoryRenderer.setVisible(true)
      } else {
        // Hide trajectory lines but keep helper curve working
        this.trajectoryRenderer.setVisible(false)
      }

      // Adjust camera zoom to show last ghost ball if needed
      this.adjustCameraForLastGhostBall()
    } catch (error) {
      this.trajectoryRenderer.clearTrajectories()
      this.table.cue.updateHelperCurve(null)
      this.view.camera.resetAimDistance()
    }
  }

  /**
   * Pause physics simulation (debug mode)
   * @param callback Optional callback to execute when resumed
   */
  pausePhysics(callback?: () => void) {
    this.isPaused = true
    this.pauseResumeCallback = callback
    this.log("⏸️  Physics paused (press Enter to continue)")
  }

  /**
   * Resume physics simulation
   */
  resumePhysics() {
    if (this.isPaused) {
      this.isPaused = false
      this.log("▶️  Physics resumed")

      // Clear any accumulated keyboard inputs during pause
      if (this.keyboard) {
        this.keyboard.pressed = {}
        this.keyboard.released = {}
      }
      this.inputQueue = []

      if (this.pauseResumeCallback) {
        this.pauseResumeCallback()
        this.pauseResumeCallback = undefined
      }
    }
  }

  /**
   * Check if physics is paused
   */
  isPhysicsPaused(): boolean {
    return this.isPaused
  }
}


