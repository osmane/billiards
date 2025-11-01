import {
  Box3,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Frustum,
  LineBasicMaterial,
  LineLoop,
  Matrix4,
  Mesh,
  Object3D,
  PerspectiveCamera,
  Scene,
  SpotLight,
  Vector3,
  MathUtils,
  WebGLRenderer,
} from "three"
import { Camera } from "./camera"
import { AimEvent } from "../events/aimevent"
import { Table } from "../model/table"
import { Grid } from "./grid"
import { renderer } from "../utils/webgl"
import { Assets } from "./assets"
import { BallMesh, DEFAULT_LIGHTING, LightingConfig } from "./ballmesh"
import { TableGeometry } from "./tablegeometry"
import { R } from "../model/physics/constants"
// Snooker import'u artık gerekli olmadığı için kaldırılabilir, çünkü bu mantık Grid sınıfına taşındı.

export class View {
  readonly scene = new Scene()
  private readonly renderer: WebGLRenderer | undefined
  camera: Camera
  windowWidth = 1
  windowHeight = 1
  readonly element
  table: Table
  loadAssets = true
  assets: Assets
  private spotLight: SpotLight | null = null
  private lightTarget = new Vector3(0, 0, 0)
  private currentLighting: LightingConfig = { ...DEFAULT_LIGHTING }
  private orbitGuide: LineLoop | null = null
  private orbitGuideSegments = 96
  private debugModeActive = false
  private lightConfigSubscription?: () => void
  constructor(element, table, assets) {
    this.element = element
    this.table = table
    this.assets = assets
    this.renderer = renderer(element)
    this.camera = new Camera(
      element ? element.offsetWidth / element.offsetHeight : 1
    )
    this.initialiseScene()
  }

  update(elapsed, aim: AimEvent, isNpcAnimating = false) {
    this.camera.update(elapsed, aim, isNpcAnimating)
  }

  sizeChanged() {
    return (
      this.windowWidth != this.element?.offsetWidth ||
      this.windowHeight != this.element?.offsetHeight
    )
  }

  updateSize() {
    const hasChanged = this.sizeChanged()
    if (hasChanged) {
      this.windowWidth = this.element?.offsetWidth
      this.windowHeight = this.element?.offsetHeight
    }
    return hasChanged
  }

  render() {
    // Automatic top view transition removed - now handled by dynamic camera tracking
    this.renderCamera(this.camera)
  }

  renderCamera(cam) {
    if (this.updateSize()) {
      const width = this.windowWidth
      const height = this.windowHeight

      this.renderer?.setSize(width, height)
      this.renderer?.setViewport(0, 0, width, height)
      this.renderer?.setScissor(0, 0, width, height)
      this.renderer?.setScissorTest(true)

      cam.camera.aspect = width / height
    }
    cam.camera.updateProjectionMatrix()
    this.updateOrbitGuideVisibility()
    this.renderer?.render(this.scene, cam.camera)
  }

  setDebugMode(enabled: boolean) {
    this.debugModeActive = enabled
    this.updateOrbitGuideVisibility()
  }

  private initialiseScene() {
    const backgroundColor = new Color(0x0d0f14)
    this.scene.background = backgroundColor
    this.renderer?.setClearColor(backgroundColor, 1)
    this.setupLighting()
    if (this.assets.background) {
      this.assets.background.visible = false
    }
    this.scene.add(this.assets.table)
    this.table.mesh = this.assets.table
    this.configureTableShadows()
    this.updateLightTargetFromTable()
    this.updateOrbitGuideGeometry(this.currentLighting)
    
    // --- DEĞİŞİKLİK BURADA ---
    // Eski, koşullu ve hatalı grid oluşturma kodunu kaldırıyoruz.
    // Yerine, oyun moduna göre doğru işaretleri (grid veya diamond)
    // kendisi oluşturan yeni statik fonksiyonumuzu çağırıyoruz.
    this.scene.add(Grid.createMarkings())
  }

  private setupLighting() {
    this.currentLighting = BallMesh.getLightingConfig()
    const spot = new SpotLight(0xffffff, this.currentLighting.intensity, 0, MathUtils.degToRad(this.currentLighting.coneDeg), 0.8, 0.6)
    spot.castShadow = this.currentLighting.castShadow
    this.spotLight = spot
    this.scene.add(spot)
    this.scene.add(spot.target)

    this.createOrbitGuide()
    this.registerLightingBindings()
  }

  private registerLightingBindings() {
    this.lightConfigSubscription?.()
    this.lightConfigSubscription = BallMesh.onLightingConfigChanged((config) => {
      this.applyLightingConfig(config)
    })
  }

  private createOrbitGuide() {
    if (this.orbitGuide) {
      return
    }
    const geometry = new BufferGeometry()
    const positions = new Float32Array(this.orbitGuideSegments * 3)
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3))
    const material = new LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.4,
    })
    material.depthTest = false
    material.depthWrite = false
    const guide = new LineLoop(geometry, material)
    guide.frustumCulled = false
    guide.visible = false
    guide.renderOrder = -1
    this.orbitGuide = guide
    this.scene.add(guide)
    this.updateOrbitGuideVisibility()
  }

  private updateOrbitGuideGeometry(config: LightingConfig) {
    if (!this.orbitGuide) {
      return
    }
    const geometry = this.orbitGuide.geometry as BufferGeometry
    let positionsAttr = geometry.getAttribute("position") as Float32BufferAttribute | null
    if (!positionsAttr || positionsAttr.count !== this.orbitGuideSegments) {
      const positions = new Float32Array(this.orbitGuideSegments * 3)
      geometry.setAttribute("position", new Float32BufferAttribute(positions, 3))
      positionsAttr = geometry.getAttribute("position") as Float32BufferAttribute
    }
    const positions = positionsAttr
    const diameter = 2 * R
    const distance = Math.max(0.01, config.distanceInDiameters * diameter)
    const elevationRad = MathUtils.degToRad(config.elevationDeg)
    const horizontalRadius = Math.max(0.01, Math.cos(elevationRad) * distance)
    const height = Math.sin(elevationRad) * distance + this.lightTarget.z
    for (let i = 0; i < this.orbitGuideSegments; i++) {
      const theta = (i / this.orbitGuideSegments) * Math.PI * 2
      const x = Math.cos(theta) * horizontalRadius + this.lightTarget.x
      const y = Math.sin(theta) * horizontalRadius + this.lightTarget.y
      positions.setXYZ(i, x, y, height)
    }
    positions.needsUpdate = true
    geometry.computeBoundingSphere()
  }

  private applyLightingConfig(config: LightingConfig) {
    if (!this.spotLight) {
      return
    }
    this.currentLighting = { ...config }
    const light = this.spotLight
    light.intensity = config.intensity
    light.decay = config.decay
    light.distance = config.decay > 0 ? 250 : 0
    light.angle = MathUtils.degToRad(config.coneDeg)
    light.color.set(config.color)
    light.color.convertSRGBToLinear()
    light.castShadow = config.castShadow

    const softnessNorm = MathUtils.clamp(config.shadowBlur / 1000, 0, 1)
    light.shadow.radius = MathUtils.lerp(0, 80, softnessNorm)
    light.penumbra = MathUtils.clamp(softnessNorm, 0, 1)

    if (
      light.shadow.mapSize.width !== config.shadowMapSize ||
      light.shadow.mapSize.height !== config.shadowMapSize
    ) {
      light.shadow.mapSize.set(config.shadowMapSize, config.shadowMapSize)
      light.shadow.map = null
    }

    if ("blurSamples" in light.shadow) {
      ;(light.shadow as unknown as { blurSamples: number }).blurSamples = config.shadowBlurSamples
    }

    light.shadow.bias = config.shadowBias
    light.shadow.normalBias = config.shadowNormalBias

    const shadowCamera = light.shadow.camera as PerspectiveCamera
    shadowCamera.near = config.shadowNear
    shadowCamera.far = config.shadowFar
    shadowCamera.updateProjectionMatrix()

    this.updateSpotLightPosition(config)
    this.updateOrbitGuideGeometry(config)

    light.shadow.needsUpdate = true
    if (this.renderer?.shadowMap) {
      this.renderer.shadowMap.needsUpdate = true
    }
  }

  private updateSpotLightPosition(config: LightingConfig) {
    if (!this.spotLight) {
      return
    }
    const angleRad = MathUtils.degToRad(config.orbitAngleDeg)
    const elevationRad = MathUtils.degToRad(config.elevationDeg)
    const diameter = 2 * R
    const distance = Math.max(0.01, config.distanceInDiameters * diameter)
    const horizontalRadius = Math.cos(elevationRad) * distance
    const x = this.lightTarget.x + Math.cos(angleRad) * horizontalRadius
    const y = this.lightTarget.y + Math.sin(angleRad) * horizontalRadius
    let z = this.lightTarget.z + Math.sin(elevationRad) * distance
    z = Math.max(this.lightTarget.z + R * 0.6, z)
    this.spotLight.position.set(x, y, z)
    this.spotLight.target.position.copy(this.lightTarget)
    this.spotLight.target.updateMatrixWorld()
  }

  private updateOrbitGuideVisibility() {
    if (!this.orbitGuide) {
      return
    }
    this.orbitGuide.visible = this.debugModeActive
  }

  private updateLightTargetFromTable() {
    if (!this.spotLight || !this.assets.table) {
      return
    }
    const bounds = new Box3().setFromObject(this.assets.table)
    bounds.getCenter(this.lightTarget)
    this.spotLight.target.position.copy(this.lightTarget)
    this.spotLight.target.updateMatrixWorld()
    this.updateSpotLightPosition(this.currentLighting)
    this.updateOrbitGuideGeometry(this.currentLighting)
  }

  private configureTableShadows() {
    const tableObject = this.assets.table
    if (!tableObject || typeof tableObject.traverse !== "function") {
      return
    }
    tableObject.traverse((child: Object3D) => {
      const mesh = child as Mesh
      if (mesh.isMesh) {
        mesh.castShadow = true
        mesh.receiveShadow = true
      }
    })
  }

  ballToCheck = 0

  isInMotionNotVisible() {
    const frustrum = this.viewFrustrum()
    const b = this.table.balls[this.ballToCheck++ % this.table.balls.length]
    return b.inMotion() && !frustrum.intersectsObject(b.ballmesh.mesh)
  }

  viewFrustrum() {
    const c = this.camera.camera
    const frustrum = new Frustum()
    frustrum.setFromProjectionMatrix(
      new Matrix4().multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse)
    )
    return frustrum
  }

  /**
   * Convert 3D world position to 2D screen space (normalized device coordinates)
   * Returns {x, y} in range [-1, 1] where (0,0) is screen center
   */
  worldToScreen(worldPos: Vector3): { x: number; y: number } {
    const vector = worldPos.clone()
    vector.project(this.camera.camera)
    return { x: vector.x, y: vector.y }
  }

  /**
   * Calculate distance from screen position to nearest edge
   * Returns distance in normalized coordinates [0, 1]
   * 0 = at edge, 1 = at opposite edge
   */
  distanceToScreenEdge(screenPos: { x: number; y: number }): number {
    // Screen coords are in [-1, 1], calculate distance to nearest edge
    const distX = 1 - Math.abs(screenPos.x)
    const distY = 1 - Math.abs(screenPos.y)
    return Math.min(distX, distY)
  }

  /**
   * Get direction from screen center to a position
   * Returns normalized direction vector in screen space
   */
  getScreenDirection(screenPos: { x: number; y: number }): { x: number; y: number } {
    const length = Math.sqrt(screenPos.x * screenPos.x + screenPos.y * screenPos.y)
    if (length < 1e-6) {
      return { x: 0, y: 0 }
    }
    return {
      x: screenPos.x / length,
      y: screenPos.y / length
    }
  }
}
