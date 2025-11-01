import {
  CanvasTexture,
  Color,
  Mesh,
  MeshPhysicalMaterial,
  MirroredRepeatWrapping,
  RepeatWrapping,
  SRGBColorSpace,
  Vector2,
  Vector3,
} from "three"
import { BallMesh, DEFAULT_LIGHTING, LightingConfig } from "./ballmesh"

export interface BroadclothParams {
  tiles: number
  mirroredRepeat: boolean
  S: number
  grid: number
  periodCells: number
  freq: number
  amp: number
  microMix: number
  seed: number
  baseColor: string
  hiColor: string
  bleed: number
  normalStrength: number
  normalScale: number
  roughness: number
  sheen: number
  sheenRoughness: number
  sheenColor: string
}

export const DEFAULT_CAROM_CLOTH_PARAMS: BroadclothParams = {
  tiles: 12,
  mirroredRepeat: false,
  S: 1024,
  grid: 6,
  periodCells: 8,
  freq: 70,
  amp: 0,
  microMix: 0.5,
  seed: 7084,
  baseColor: "#0d8c94",
  hiColor: "#1bb0b6",
  bleed: 0,
  normalStrength: 0,
  normalScale: 0.75,
  roughness: 0.59,
  sheen: 0,
  sheenRoughness: 1,
  sheenColor: "#22a8b0",
}

export interface ClothAndLightingSettings {
  cloth: BroadclothParams
  lighting: LightingConfig
}

type NumberTriplet = [number, number, number]

const smooth = (t: number) => t * t * (3 - 2 * t)
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

function hash2(ix: number, iy: number, period: number, seed = 0) {
  ix = ((ix % period) + period) % period
  iy = ((iy % period) + period) % period
  let x = (ix + seed) * 374761393 + (iy - seed) * 668265263
  x = (x ^ (x >>> 13)) * 1274126177
  return ((x ^ (x >>> 16)) >>> 0) / 4294967295
}

function valueNoise(
  x: number,
  y: number,
  cell: number,
  period: number,
  seed = 0
) {
  const gx = x / cell
  const gy = y / cell
  const x0 = Math.floor(gx)
  const y0 = Math.floor(gy)
  const tx = gx - x0
  const ty = gy - y0
  const x1 = x0 + 1
  const y1 = y0 + 1
  const v00 = hash2(x0, y0, period, seed)
  const v10 = hash2(x1, y0, period, seed)
  const v01 = hash2(x0, y1, period, seed)
  const v11 = hash2(x1, y1, period, seed)
  const sx = smooth(tx)
  const sy = smooth(ty)
  return (v00 * (1 - sx) + v10 * sx) * (1 - sy) + (v01 * (1 - sx) + v11 * sx) * sy
}

function hexToRGB(hex: string): NumberTriplet {
  const sanitized = hex.replace("#", "")
  const parsed =
    sanitized.length === 3
      ? parseInt(
          sanitized
            .split("")
            .map((c) => c + c)
            .join(""),
          16
        )
      : parseInt(sanitized, 16)
  const r = (parsed >> 16) & 255
  const g = (parsed >> 8) & 255
  const b = parsed & 255
  return [r, g, b]
}

function withEdgeBleed(
  src: HTMLCanvasElement,
  bleed = 0
): { canvas: HTMLCanvasElement; innerSize: number } {
  if (bleed <= 0) {
    return { canvas: src, innerSize: src.width }
  }
  const S = src.width
  const T = S + bleed * 2
  const out = document.createElement("canvas")
  out.width = out.height = T
  const ctx = out.getContext("2d")!
  ctx.drawImage(src, bleed, bleed)
  ctx.drawImage(src, 0, 0, S, bleed, bleed, 0, S, bleed)
  ctx.drawImage(src, 0, S - bleed, S, bleed, bleed, S + bleed, S, bleed)
  ctx.drawImage(src, 0, 0, bleed, S, 0, bleed, bleed, S)
  ctx.drawImage(src, S - bleed, 0, bleed, S, S + bleed, bleed, bleed, S)
  ctx.drawImage(src, 0, 0, bleed, bleed, 0, 0, bleed, bleed)
  ctx.drawImage(
    src,
    S - bleed,
    0,
    bleed,
    bleed,
    S + bleed,
    0,
    bleed,
    bleed
  )
  ctx.drawImage(
    src,
    0,
    S - bleed,
    bleed,
    bleed,
    0,
    S + bleed,
    bleed,
    bleed
  )
  ctx.drawImage(
    src,
    S - bleed,
    S - bleed,
    bleed,
    bleed,
    S + bleed,
    S + bleed,
    bleed,
    bleed
  )
  return { canvas: out, innerSize: S }
}

function normalFrom(canvas: HTMLCanvasElement, strength: number) {
  const s = canvas.width
  const ctx = canvas.getContext("2d")!
  const img = ctx.getImageData(0, 0, s, s)
  const d = img.data
  const luminance = new Float32Array(s * s)
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    luminance[j] =
      (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255
  }
  const out = document.createElement("canvas")
  out.width = out.height = s
  const octx = out.getContext("2d")!
  const oimg = octx.createImageData(s, s)
  const od = oimg.data
  const sxKernel = [-1, 0, 1, -2, 0, 2, -1, 0, 1]
  const syKernel = [-1, -2, -1, 0, 0, 0, 1, 2, 1]
  const tap = (x: number, y: number) =>
    luminance[((y + s) % s) * s + ((x + s) % s)]
  for (let y = 0, idx = 0; y < s; y++) {
    for (let x = 0; x < s; x++, idx += 4) {
      let gx = 0
      let gy = 0
      let k = 0
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++, k++) {
          const v = tap(x + i, y + j)
          gx += v * sxKernel[k]
          gy += v * syKernel[k]
        }
      }
      const nx = -gx * strength
      const ny = -gy * strength
      const nz = 1.0
      const inv = 1 / Math.hypot(nx, ny, nz)
      od[idx] = ((nx * inv) * 0.5 + 0.5) * 255
      od[idx + 1] = ((ny * inv) * 0.5 + 0.5) * 255
      od[idx + 2] = ((nz * inv) * 0.5 + 0.5) * 255
      od[idx + 3] = 255
    }
  }
  octx.putImageData(oimg, 0, 0)
  return out
}

function makeWeaveBase(params: BroadclothParams) {
  const {
    S,
    grid,
    periodCells,
    freq,
    amp,
    microMix,
    seed,
    baseColor,
    hiColor,
  } = params
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = S
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!
  const img = ctx.createImageData(S, S)
  const data = img.data
  const base = hexToRGB(baseColor)
  const hi = hexToRGB(hiColor)

  for (let y = 0, i = 0; y < S; y++) {
    for (let x = 0; x < S; x++, i += 4) {
      const n1 = valueNoise(x, y, grid, periodCells, seed)
      const n2 = valueNoise(x + 1000, y + 1000, grid, periodCells, seed)
      const u = x / S
      const v = y / S
      const a = Math.sin((u * freq + amp * (n1 - 0.5)) * Math.PI * 2)
      const b = Math.sin((v * freq + amp * (n2 - 0.5)) * Math.PI * 2)
      let weave = Math.pow(Math.abs(a) * Math.abs(b), 0.55)
      const micro = valueNoise(x * 1.7, y * 1.7, grid * 0.7, periodCells, seed)
      weave = weave * (1 - microMix) + micro * microMix
      const tint = clamp01(weave)
      data[i] = base[0] * (1 - tint) + hi[0] * tint
      data[i + 1] = base[1] * (1 - tint) + hi[1] * tint
      data[i + 2] = base[2] * (1 - tint) + hi[2] * tint
      data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

function canvasTexture(canvas: HTMLCanvasElement) {
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  texture.needsUpdate = true
  return texture
}

export class CaromClothManager {
    private params: BroadclothParams
    private clothMaterial: MeshPhysicalMaterial | null = null
    private cushionMaterial: MeshPhysicalMaterial | null = null
    private clothMesh: Mesh | null = null
    private cushionMeshes: Mesh[] = []
    private lightingConfig: LightingConfig = { ...DEFAULT_LIGHTING }
    private diffuseMap: CanvasTexture | null = null
    private normalMap: CanvasTexture | null = null

  constructor(
    surfaces: { cloth: Mesh; cushions: Mesh[] } | null,
    initial?: Partial<BroadclothParams>
  ) {
    this.params = { ...DEFAULT_CAROM_CLOTH_PARAMS, ...(initial ?? {}) }
    this.lightingConfig = BallMesh.getLightingConfig()
    this.setSurfaces(surfaces)
    BallMesh.updateLightingConfig(this.lightingConfig)
  }

  setSurfaces(surfaces: { cloth: Mesh; cushions: Mesh[] } | null) {
    this.clothMesh = surfaces?.cloth ?? null
    this.cushionMeshes = surfaces?.cushions ?? []
    if (this.clothMesh) {
      this.applyMaterials()
    }
  }

  getCurrentSettings(): ClothAndLightingSettings {
    return {
      cloth: { ...this.params },
      lighting: { ...this.lightingConfig },
    }
  }

  updateCloth(partial: Partial<BroadclothParams>) {
    this.params = { ...this.params, ...partial }
    this.applyMaterials()
  }

  updateLighting(partial: Partial<LightingConfig>) {
    this.lightingConfig = { ...this.lightingConfig, ...partial }
    BallMesh.updateLightingConfig(this.lightingConfig)
  }

  private applyMaterials() {
    if (!this.clothMesh) {
      return
    }

    const baseCanvas = makeWeaveBase(this.params)
    const { canvas: finalCanvas } = withEdgeBleed(
      baseCanvas,
      this.params.bleed
    )
    const normalCanvas = normalFrom(finalCanvas, this.params.normalStrength)

    if (!this.diffuseMap) {
      this.diffuseMap = canvasTexture(finalCanvas)
    } else {
      this.diffuseMap.image = finalCanvas
      this.diffuseMap.needsUpdate = true
    }

    if (!this.normalMap) {
      this.normalMap = canvasTexture(normalCanvas)
    } else {
      this.normalMap.image = normalCanvas
      this.normalMap.needsUpdate = true
    }

    const wrapping = this.params.mirroredRepeat
      ? MirroredRepeatWrapping
      : RepeatWrapping
    this.diffuseMap.wrapS = this.diffuseMap.wrapT = wrapping
    this.normalMap.wrapS = this.normalMap.wrapT = wrapping

    const repeat = this.computeRepeat()
    this.diffuseMap.repeat.copy(repeat)
    this.normalMap.repeat.copy(repeat)

    if (!this.clothMaterial) {
      this.clothMaterial = new MeshPhysicalMaterial({
        map: this.diffuseMap,
        normalMap: this.normalMap,
        roughness: this.params.roughness,
        sheen: this.params.sheen,
        sheenRoughness: this.params.sheenRoughness,
        sheenColor: new Color(this.params.sheenColor),
      })
      this.clothMesh.material = this.clothMaterial
    } else {
      this.clothMaterial.map = this.diffuseMap
      this.clothMaterial.normalMap = this.normalMap
      this.clothMaterial.roughness = this.params.roughness
      this.clothMaterial.sheen = this.params.sheen
      this.clothMaterial.sheenRoughness = this.params.sheenRoughness
      this.clothMaterial.sheenColor.set(this.params.sheenColor)
      this.clothMaterial.needsUpdate = true
    }
    this.clothMaterial.normalScale.set(
      this.params.normalScale,
      this.params.normalScale
    )

    if (!this.cushionMaterial) {
      this.cushionMaterial = new MeshPhysicalMaterial({
        map: this.diffuseMap,
        normalMap: this.normalMap,
        roughness: Math.min(1, this.params.roughness + 0.1),
        sheen: this.params.sheen * 0.5,
        sheenRoughness: clamp01(this.params.sheenRoughness * 0.85),
        sheenColor: new Color(this.params.sheenColor).multiplyScalar(0.8),
      })
    } else {
      this.cushionMaterial.map = this.diffuseMap
      this.cushionMaterial.normalMap = this.normalMap
      this.cushionMaterial.needsUpdate = true
    }
    this.cushionMaterial.normalScale.set(
      this.params.normalScale * 0.6,
      this.params.normalScale * 0.6
    )
    this.cushionMeshes.forEach((mesh) => {
      mesh.material = this.cushionMaterial!
    })

    BallMesh.updateLightingConfig(this.lightingConfig)
  }

  private computeRepeat() {
    if (!this.clothMesh?.geometry.boundingBox) {
      this.clothMesh?.geometry.computeBoundingBox()
    }
    const size = new Vector3(1, 1, 1)
    this.clothMesh?.geometry.boundingBox?.getSize(size)
    const repeatX = this.params.tiles
    const aspect = size.y !== 0 ? size.y / size.x : 1
    const repeatY = repeatX * aspect
    return new Vector2(repeatX, repeatY)
  }
}
