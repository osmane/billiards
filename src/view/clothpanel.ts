
import { CaromClothManager, DEFAULT_CAROM_CLOTH_PARAMS } from "./caromcloth"
import { LightingConfig } from "./ballmesh"

type InputHandler = (value: number | string | boolean) => void

export class ClothPanel {
  private readonly container: HTMLElement | null
  private clothParams = { ...DEFAULT_CAROM_CLOTH_PARAMS }
  private lightingParams: LightingConfig

  constructor(private readonly manager: CaromClothManager) {
    this.container = document.getElementById("constants")
    const current = manager.getCurrentSettings()
    this.clothParams = { ...current.cloth }
    this.lightingParams = { ...current.lighting }
    this.initialisePanel()
  }

  private initialisePanel() {
    if (!this.container) {
      return
    }
    let panel = this.container.querySelector<HTMLDivElement>("#caromClothControls")
    if (panel) {
      panel.innerHTML = ""
    } else {
      panel = document.createElement("div")
      panel.id = "caromClothControls"
      panel.style.borderTop = "1px solid #2c2c2c"
      panel.style.paddingTop = "8px"
      panel.style.marginTop = "12px"
      panel.style.display = "grid"
      panel.style.gap = "6px"
      this.container.appendChild(panel)
    }

    this.createSectionTitle(panel, "Three Cushion Cloth")
    this.createRange(panel, "tiles", "Tiles", 1, 24, 1, this.clothParams.tiles, (v) => {
      this.clothParams.tiles = Number(v)
      this.manager.updateCloth({ ...this.clothParams })
    })
    this.createCheckbox(panel, "mirroredRepeat", "Mirrored Repeat", this.clothParams.mirroredRepeat, (v) => {
      this.clothParams.mirroredRepeat = Boolean(v)
      this.manager.updateCloth({ ...this.clothParams })
    })
    this.createSelect(panel, "resolution", "Resolution", [256, 512, 1024], this.clothParams.S, (v) => {
      this.clothParams.S = Number(v)
      this.manager.updateCloth({ ...this.clothParams })
    })

    this.createRange(panel, "grid", "Grid", 4, 24, 1, this.clothParams.grid, (v) => {
      this.clothParams.grid = Number(v)
      this.manager.updateCloth({ ...this.clothParams })
    })
    this.createRange(panel, "periodCells", "Period Cells", 4, 32, 1, this.clothParams.periodCells, (v) => {
      this.clothParams.periodCells = Number(v)
      this.manager.updateCloth({ ...this.clothParams })
    })
    this.createRange(panel, "freq", "Frequency", 10, 120, 1, this.clothParams.freq, (v) => {
      this.clothParams.freq = Number(v)
      this.manager.updateCloth({ ...this.clothParams })
    })
    this.createRange(panel, "amp", "Amplitude", 0, 1, 0.01, this.clothParams.amp, (v) => {
      this.clothParams.amp = Number(v)
      this.manager.updateCloth({ ...this.clothParams })
    })
    this.createRange(panel, "microMix", "Micro Mix", 0, 0.5, 0.01, this.clothParams.microMix, (v) => {
      this.clothParams.microMix = Number(v)
      this.manager.updateCloth({ ...this.clothParams })
    })

    this.createColor(panel, "baseColor", "Base Color", this.clothParams.baseColor, (v) => {
      this.clothParams.baseColor = String(v)
      this.manager.updateCloth({ ...this.clothParams })
    })
    this.createColor(panel, "hiColor", "Highlight Color", this.clothParams.hiColor, (v) => {
      this.clothParams.hiColor = String(v)
      this.manager.updateCloth({ ...this.clothParams })
    })
    this.createNumber(panel, "seed", "Seed", 0, 9999, 1, this.clothParams.seed, (v) => {
      this.clothParams.seed = Number(v)
      this.manager.updateCloth({ ...this.clothParams })
    })

    this.createRange(panel, "bleed", "Bleed", 0, 16, 1, this.clothParams.bleed, (v) => {
      this.clothParams.bleed = Number(v)
      this.manager.updateCloth({ ...this.clothParams })
    })
    this.createRange(panel, "normalStrength", "Normal Strength", 0, 2, 0.05, this.clothParams.normalStrength, (v) => {
      this.clothParams.normalStrength = Number(v)
      this.manager.updateCloth({ ...this.clothParams })
    })
    this.createRange(panel, "normalScale", "Normal Scale", 0, 1, 0.01, this.clothParams.normalScale, (v) => {
      this.clothParams.normalScale = Number(v)
      this.manager.updateCloth({ ...this.clothParams })
    })
    this.createRange(panel, "roughness", "Roughness", 0, 1, 0.01, this.clothParams.roughness, (v) => {
      this.clothParams.roughness = Number(v)
      this.manager.updateCloth({ ...this.clothParams })
    })
    this.createRange(panel, "sheen", "Sheen", 0, 1, 0.01, this.clothParams.sheen, (v) => {
      this.clothParams.sheen = Number(v)
      this.manager.updateCloth({ ...this.clothParams })
    })
    this.createRange(panel, "sheenRoughness", "Sheen Roughness", 0, 1, 0.01, this.clothParams.sheenRoughness, (v) => {
      this.clothParams.sheenRoughness = Number(v)
      this.manager.updateCloth({ ...this.clothParams })
    })
    this.createColor(panel, "sheenColor", "Sheen Color", this.clothParams.sheenColor, (v) => {
      this.clothParams.sheenColor = String(v)
      this.manager.updateCloth({ ...this.clothParams })
    })

    this.createSectionTitle(panel, "Lighting & Shadows")
    this.createRange(panel, "lightAngle", "Light Angle", 0, 360, 1, this.lightingParams.orbitAngleDeg, (v) => {
      this.lightingParams.orbitAngleDeg = Number(v)
      this.manager.updateLighting({ ...this.lightingParams })
    })
    this.createRange(
      panel,
      "lightElevation",
      "Light Elevation",
      -45,
      80,
      1,
      this.lightingParams.elevationDeg,
      (v) => {
        this.lightingParams.elevationDeg = Number(v)
        this.manager.updateLighting({ ...this.lightingParams })
      }
    )
    this.createRange(
      panel,
      "lightDistance",
      "Distance (diameters)",
      6,
      400,
      0.5,
      this.lightingParams.distanceInDiameters,
      (v) => {
        this.lightingParams.distanceInDiameters = Number(v)
        this.manager.updateLighting({ ...this.lightingParams })
      }
    )
    this.createRange(
      panel,
      "lightIntensity",
      "Intensity",
      0,
      10,
      0.1,
      this.lightingParams.intensity,
      (v) => {
        this.lightingParams.intensity = Number(v)
        this.manager.updateLighting({ ...this.lightingParams })
      }
    )
    this.createRange(panel, "lightDecay", "Decay", 0, 5, 0.1, this.lightingParams.decay, (v) => {
      this.lightingParams.decay = Number(v)
      this.manager.updateLighting({ ...this.lightingParams })
    })
    this.createRange(panel, "lightCone", "Cone (deg)", 10, 80, 1, this.lightingParams.coneDeg, (v) => {
      this.lightingParams.coneDeg = Number(v)
      this.manager.updateLighting({ ...this.lightingParams })
    })
    this.createColor(panel, "lightColor", "Light Color", this.lightingParams.color, (v) => {
      this.lightingParams.color = String(v)
      this.manager.updateLighting({ ...this.lightingParams })
    })
    this.createRange(panel, "shadowBlur", "Shadow Softness", 0, 1000, 1, this.lightingParams.shadowBlur, (v) => {
      this.lightingParams.shadowBlur = Number(v)
      this.manager.updateLighting({ ...this.lightingParams })
    })
    this.createSelect(
      panel,
      "shadowMapSize",
      "Shadow Map",
      [1024, 2048, 4096],
      this.lightingParams.shadowMapSize,
      (v) => {
        this.lightingParams.shadowMapSize = Number(v)
        this.manager.updateLighting({ ...this.lightingParams })
      }
    )
    this.createRange(
      panel,
      "shadowSamples",
      "Blur Samples",
      4,
      32,
      1,
      this.lightingParams.shadowBlurSamples,
      (v) => {
        this.lightingParams.shadowBlurSamples = Number(v)
        this.manager.updateLighting({ ...this.lightingParams })
      }
    )
    this.createRange(
      panel,
      "shadowBias",
      "Shadow Bias",
      -0.001,
      0,
      0.00005,
      this.lightingParams.shadowBias,
      (v) => {
        this.lightingParams.shadowBias = Number(v)
        this.manager.updateLighting({ ...this.lightingParams })
      }
    )
    this.createRange(
      panel,
      "shadowNormalBias",
      "Normal Bias",
      0,
      0.1,
      0.001,
      this.lightingParams.shadowNormalBias,
      (v) => {
        this.lightingParams.shadowNormalBias = Number(v)
        this.manager.updateLighting({ ...this.lightingParams })
      }
    )
    this.createCheckbox(panel, "castShadow", "Cast Shadow", this.lightingParams.castShadow, (v) => {
      this.lightingParams.castShadow = Boolean(v)
      this.manager.updateLighting({ ...this.lightingParams })
    })
    this.createRange(
      panel,
      "shadowNear",
      "Shadow Near",
      0.5,
      30,
      0.1,
      this.lightingParams.shadowNear,
      (v) => {
        this.lightingParams.shadowNear = Number(v)
        this.manager.updateLighting({ ...this.lightingParams })
      }
    )
    this.createRange(
      panel,
      "shadowFar",
      "Shadow Far",
      2,
      80,
      0.5,
      this.lightingParams.shadowFar,
      (v) => {
        this.lightingParams.shadowFar = Number(v)
        this.manager.updateLighting({ ...this.lightingParams })
      }
    )
  }

  private createSectionTitle(root: HTMLElement, label: string) {
    const title = document.createElement("h4")
    title.textContent = label
    title.style.margin = "12px 0 4px"
    title.style.fontSize = "12px"
    title.style.color = "#9de3ff"
    title.style.textTransform = "uppercase"
    root.appendChild(title)
  }

  private createRange(
    root: HTMLElement,
    id: string,
    label: string,
    min: number,
    max: number,
    step: number,
    value: number,
    handler: InputHandler
  ) {
    const wrapper = document.createElement("label")
    wrapper.style.display = "flex"
    wrapper.style.flexDirection = "column"
    wrapper.style.gap = "2px"
    const decimals = (() => {
      const str = step.toString()
      if (!str.includes(".")) {
        return 0
      }
      return str.split(".")[1].length
    })()
    const text = document.createElement("span")
    text.textContent = `${label}: ${value.toFixed(decimals)}`
    text.style.fontSize = "11px"
    wrapper.appendChild(text)
    const input = document.createElement("input")
    input.type = "range"
    input.min = String(min)
    input.max = String(max)
    input.step = String(step)
    input.value = String(value)
    input.id = id
    input.addEventListener("input", (ev) => {
      const val = parseFloat((ev.target as HTMLInputElement).value)
      text.textContent = `${label}: ${val.toFixed(decimals)}`
      handler(val)
    })
    wrapper.appendChild(input)
    root.appendChild(wrapper)
  }

  private createCheckbox(
    root: HTMLElement,
    id: string,
    label: string,
    value: boolean,
    handler: InputHandler
  ) {
    const wrapper = document.createElement("label")
    wrapper.style.display = "flex"
    wrapper.style.alignItems = "center"
    wrapper.style.gap = "6px"
    const input = document.createElement("input")
    input.type = "checkbox"
    input.id = id
    input.checked = value
    input.addEventListener("change", (ev) => {
      handler((ev.target as HTMLInputElement).checked)
    })
    const text = document.createElement("span")
    text.textContent = label
    text.style.fontSize = "11px"
    wrapper.appendChild(input)
    wrapper.appendChild(text)
    root.appendChild(wrapper)
  }

  private createColor(
    root: HTMLElement,
    id: string,
    label: string,
    value: string,
    handler: InputHandler
  ) {
    const wrapper = document.createElement("label")
    wrapper.style.display = "flex"
    wrapper.style.alignItems = "center"
    wrapper.style.justifyContent = "space-between"
    wrapper.style.gap = "8px"
    const text = document.createElement("span")
    text.textContent = label
    text.style.fontSize = "11px"
    const input = document.createElement("input")
    input.type = "color"
    input.id = id
    input.value = value
    input.style.flex = "0 0 auto"
    input.addEventListener("input", (ev) => {
      handler((ev.target as HTMLInputElement).value)
    })
    wrapper.appendChild(text)
    wrapper.appendChild(input)
    root.appendChild(wrapper)
  }

  private createNumber(
    root: HTMLElement,
    id: string,
    label: string,
    min: number,
    max: number,
    step: number,
    value: number,
    handler: InputHandler
  ) {
    const wrapper = document.createElement("label")
    wrapper.style.display = "flex"
    wrapper.style.alignItems = "center"
    wrapper.style.justifyContent = "space-between"
    wrapper.style.gap = "8px"
    const text = document.createElement("span")
    text.textContent = label
    text.style.fontSize = "11px"
    const input = document.createElement("input")
    input.type = "number"
    input.id = id
    input.value = String(value)
    input.min = String(min)
    input.max = String(max)
    input.step = String(step)
    input.style.width = "70px"
    input.addEventListener("change", (ev) => {
      handler(parseFloat((ev.target as HTMLInputElement).value))
    })
    wrapper.appendChild(text)
    wrapper.appendChild(input)
    root.appendChild(wrapper)
  }

  private createSelect(
    root: HTMLElement,
    id: string,
    label: string,
    options: number[],
    value: number,
    handler: InputHandler
  ) {
    const wrapper = document.createElement("label")
    wrapper.style.display = "flex"
    wrapper.style.alignItems = "center"
    wrapper.style.justifyContent = "space-between"
    wrapper.style.gap = "8px"
    const text = document.createElement("span")
    text.textContent = label
    text.style.fontSize = "11px"
    const select = document.createElement("select")
    select.id = id
    options.forEach((option) => {
      const opt = document.createElement("option")
      opt.value = String(option)
      opt.textContent = String(option)
      if (option === value) {
        opt.selected = true
      }
      select.appendChild(opt)
    })
    select.addEventListener("change", (ev) => {
      handler(parseInt((ev.target as HTMLSelectElement).value, 10))
    })
    wrapper.appendChild(text)
    wrapper.appendChild(select)
    root.appendChild(wrapper)
  }
}
