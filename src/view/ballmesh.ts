import {
  ArrowHelper,
  CanvasTexture,
  CircleGeometry,
  Color,
  DoubleSide,
  Euler,
  Material,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector2,
  Vector3,
} from "three"
import { State } from "../model/ball"
import { norm, up, zero } from "../utils/utils"
import { R } from "../model/physics/constants"
import { Trace } from "./trace"

export interface LightingConfig {
  orbitAngleDeg: number
  elevationDeg: number
  distanceInDiameters: number
  intensity: number
  decay: number
  coneDeg: number
  color: string
  shadowBias: number
  shadowNormalBias: number
  shadowBlur: number
  shadowMapSize: number
  shadowBlurSamples: number
  shadowNear: number
  shadowFar: number
  castShadow: boolean
}

export const DEFAULT_LIGHTING: LightingConfig = {
  orbitAngleDeg: 270,
  elevationDeg: 80,
  distanceInDiameters: 24,
  intensity: 8.4,
  decay: 1.4,
  coneDeg: 57,
  color: "#f5f8ff",
  shadowBias: -0.00005,
  shadowNormalBias: 0,
  shadowBlur: 185,
  shadowMapSize: 2048,
  shadowBlurSamples: 15,
  shadowNear: 0.5,
  shadowFar: 2,
  castShadow: true,
}

const clampLighting = (config: LightingConfig): LightingConfig => {
  const safeAngle = Number.isFinite(config.orbitAngleDeg)
    ? config.orbitAngleDeg
    : DEFAULT_LIGHTING.orbitAngleDeg
  const safeElevation = Number.isFinite(config.elevationDeg)
    ? config.elevationDeg
    : DEFAULT_LIGHTING.elevationDeg
  const safeDistance = Number.isFinite(config.distanceInDiameters)
    ? config.distanceInDiameters
    : DEFAULT_LIGHTING.distanceInDiameters
  const safeIntensity = Number.isFinite(config.intensity)
    ? config.intensity
    : DEFAULT_LIGHTING.intensity
  const safeDecay = Number.isFinite(config.decay) ? config.decay : DEFAULT_LIGHTING.decay
  const safeCone = Number.isFinite(config.coneDeg) ? config.coneDeg : DEFAULT_LIGHTING.coneDeg
  const safeBias = Number.isFinite(config.shadowBias)
    ? config.shadowBias
    : DEFAULT_LIGHTING.shadowBias
  const safeNormalBias = Number.isFinite(config.shadowNormalBias)
    ? config.shadowNormalBias
    : DEFAULT_LIGHTING.shadowNormalBias
  const safeBlur = Number.isFinite(config.shadowBlur)
    ? config.shadowBlur
    : DEFAULT_LIGHTING.shadowBlur
  const safeMapSize =
    Number.isFinite(config.shadowMapSize) && config.shadowMapSize > 0
      ? config.shadowMapSize
      : DEFAULT_LIGHTING.shadowMapSize
  const safeSamples = Number.isFinite(config.shadowBlurSamples)
    ? config.shadowBlurSamples
    : DEFAULT_LIGHTING.shadowBlurSamples
  const safeNear =
    Number.isFinite(config.shadowNear) && config.shadowNear > 0
      ? config.shadowNear
      : DEFAULT_LIGHTING.shadowNear
  const safeFar = Number.isFinite(config.shadowFar)
    ? config.shadowFar
    : DEFAULT_LIGHTING.shadowFar

  const mapSize = Math.pow(
    2,
    Math.round(MathUtils.clamp(Math.log2(safeMapSize), 8, 12))
  )

  return {
    orbitAngleDeg: MathUtils.euclideanModulo(safeAngle, 360),
    elevationDeg: MathUtils.clamp(safeElevation, -80, 85),
    distanceInDiameters: Math.max(0.01, safeDistance),
    intensity: Math.max(0, safeIntensity),
    decay: Math.max(0, safeDecay),
    coneDeg: MathUtils.clamp(safeCone, 5, 90),
    color: config.color ?? DEFAULT_LIGHTING.color,
    shadowBias: safeBias,
    shadowNormalBias: Math.max(0, safeNormalBias),
    shadowBlur: MathUtils.clamp(safeBlur, 0, 1000),
    shadowMapSize: mapSize,
    shadowBlurSamples: Math.round(MathUtils.clamp(safeSamples, 1, 32)),
    shadowNear: Math.max(0.1, safeNear),
    shadowFar: Math.max(Math.max(0.1, safeNear) + 0.1, safeFar),
    castShadow: Boolean(config.castShadow),
  }
}

export class BallMesh {
  mesh: Mesh
  spinAxisArrow: ArrowHelper
  velocityArrow: ArrowHelper
  trace: Trace
  color: Color
  radius: number

  private material: MeshPhysicalMaterial
  private dotMeshes: Mesh[] = []

  private static instances = new Set<BallMesh>()
  private static lightingConfig: LightingConfig = { ...DEFAULT_LIGHTING }
  private static lightingListeners = new Set<(config: LightingConfig) => void>()

  constructor(color: number, radius: number = R) {
    this.color = new Color(color)
    this.radius = radius
    this.material = BallMesh.createBallMaterial(this.color)
    this.mesh = this.createBallMesh()
    this.spinAxisArrow = new ArrowHelper(up, zero, 2, 0x000000, 0.01, 0.01)
    this.spinAxisArrow.visible = false
    // Velocity arrow (debug): black arrow showing velocity direction
    this.velocityArrow = new ArrowHelper(up, zero, 2 * this.radius, 0x000000, 0.015, 0.015)
    this.velocityArrow.visible = false
    this.trace = new Trace(500, color)

    BallMesh.instances.add(this)
  }

  updateAll(ball, t: number) {
    this.updatePosition(ball.pos)
    this.updateArrows(ball.pos, ball.rvel, ball.vel, ball.state)
    if (ball.rvel.lengthSq() !== 0) {
      this.updateRotation(ball.rvel, t)
      this.trace.addTrace(ball.pos, ball.vel)
    }
  }

  updatePosition(pos: Vector3) {
    this.mesh.position.copy(pos)
  }

  updateRotation(rvel: Vector3, t: number) {
    const angle = rvel.length() * t
    if (angle === 0) {
      return
    }
    this.mesh.rotateOnWorldAxis(norm(rvel), angle)
  }

  updateArrows(pos: Vector3, rvel: Vector3, vel: Vector3, state: State) {
    // Update spin axis arrow
    if (this.spinAxisArrow.visible) {
      this.spinAxisArrow.setLength(
        this.radius + (this.radius * rvel.length()) / 2,
        this.radius,
        this.radius
      )
      this.spinAxisArrow.position.copy(pos)
      this.spinAxisArrow.setDirection(norm(rvel))
      if (state === State.Rolling) {
        this.spinAxisArrow.setColor(0xcc0000)
      } else {
        this.spinAxisArrow.setColor(0x00cc00)
      }
    }

    // Update velocity arrow (debug mode)
    if (this.velocityArrow.visible && vel.lengthSq() > 0) {
      // Arrow length = ball diameter (2 * radius)
      this.velocityArrow.setLength(2 * this.radius, 0.015, 0.015)
      this.velocityArrow.position.copy(pos)
      this.velocityArrow.setDirection(norm(vel))
    }
  }

  addToScene(scene) {
    scene.add(this.mesh)
    scene.add(this.spinAxisArrow)
    scene.add(this.velocityArrow)
    scene.add(this.trace.line)
  }

  removeFromScene(scene) {
    scene.remove(this.mesh)
    scene.remove(this.spinAxisArrow)
    scene.remove(this.velocityArrow)
    scene.remove(this.trace.line)
  }

  clearDots() {
    this.dotMeshes.forEach((dot) => {
      dot.geometry.dispose()
      const dotMaterial = dot.material
      if (Array.isArray(dotMaterial)) {
        dotMaterial.forEach((mat) => mat.dispose())
      } else if (dotMaterial) {
        ;(dotMaterial as Material).dispose()
      }
      this.mesh.remove(dot)
    })
    this.dotMeshes = []
  }

  applySymmetricDots(dotColor = 0xff0000, diameterRatio = 0.089) {
    this.clearDots()

    const dotRadius = this.radius * diameterRatio
    const geometrySegments = 64
    const normals = [
      new Vector3(1, 0, 0),
      new Vector3(-1, 0, 0),
      new Vector3(0, 1, 0),
      new Vector3(0, -1, 0),
      new Vector3(0, 0, 1),
      new Vector3(0, 0, -1),
    ]

    normals.forEach((normal) => {
      const geometry = new CircleGeometry(dotRadius, geometrySegments)
      const material = new MeshStandardMaterial({
        color: dotColor,
        metalness: 0,
        roughness: 0.35,
        transparent: false,
        side: DoubleSide,
      })
      const dot = new Mesh(geometry, material)

      const orientation = new Quaternion().setFromUnitVectors(
        new Vector3(0, 0, 1),
        normal.clone().normalize()
      )
      dot.quaternion.copy(orientation)

      const offset = normal
        .clone()
        .normalize()
        .multiplyScalar(this.radius + this.radius * 0.001)
      dot.position.copy(offset)

      dot.renderOrder = this.mesh.renderOrder + 1

      this.mesh.add(dot)
      this.dotMeshes.push(dot)
    })
  }

  updateRadius(newRadius: number) {
    if (this.radius === newRadius) {
      return
    }
    this.radius = newRadius
    this.mesh.geometry.dispose()
    this.mesh.geometry = new SphereGeometry(this.radius, 64, 48)
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.material.dispose()
    this.clearDots()
    this.trace.dispose()
    BallMesh.instances.delete(this)
  }

  static getLightingConfig(): LightingConfig {
    return { ...BallMesh.lightingConfig }
  }

  static updateLightingConfig(partial: Partial<LightingConfig>) {
    const next = {
      ...BallMesh.lightingConfig,
      ...partial,
    }
    BallMesh.lightingConfig = clampLighting(next)
    const current = BallMesh.getLightingConfig()
    BallMesh.lightingListeners.forEach((listener) => listener(current))
  }

  static onLightingConfigChanged(listener: (config: LightingConfig) => void): () => void {
    BallMesh.lightingListeners.add(listener)
    listener(BallMesh.getLightingConfig())
    return () => {
      BallMesh.lightingListeners.delete(listener)
    }
  }

  private createBallMesh(): Mesh {
    const geometry = new SphereGeometry(this.radius, 64, 48)
    const mesh = new Mesh(geometry, this.material)
    mesh.name = "ball"
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.renderOrder = 1
    return mesh
  }

  private static createBallMaterial(color: Color): MeshPhysicalMaterial {
    const material = new MeshPhysicalMaterial({
      color: color.clone(),
      roughness: 0.45,
      metalness: 0.25,
      clearcoat: 0.6,
      clearcoatRoughness: 0.15,
      reflectivity: 0.45,
    })
    material.needsUpdate = true
    return material
  }
}
