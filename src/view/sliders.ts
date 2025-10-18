import {
  R,
  e,
  m,
  mu,
  muC,
  muS,
  rho,
  μs,
  μw,
  ee,
  magnusCoeff,
  tableRestitution,
  magnusAirborneMultiplier,
  magnusTableMultiplier,
  setR,
  sete,
  setm,
  setmu,
  setmuC,
  setmuS,
  setrho,
  setμs,
  setμw,
  setee,
  setMagnusCoeff,
  setTableRestitution,
  setMagnusAirborneMultiplier,
  setMagnusTableMultiplier,
} from "../model/physics/constants"

export class Sliders {
  private element: HTMLElement | null
  private visible: boolean
  notify
  container: any

  constructor(notify?, container?) {
    this.notify = notify ?? (() => {})
    this.container = container
    this.element = document.getElementById("constants") as HTMLElement | null
    this.visible = this.computeInitialVisibility()
    this.applyVisibility()

    this.initialiseSlider("R", R, setR)
    this.initialiseSlider("m", m, setm)
    this.initialiseSlider("e", e, sete)
    this.initialiseSlider("mu", mu, setmu)
    this.initialiseSlider("muS", muS, setmuS)
    this.initialiseSlider("muC", muC, setmuC)
    this.initialiseSlider("rho", rho, setrho)
    this.initialiseSlider("μs", μs, setμs)
    this.initialiseSlider("μw", μw, setμw)
    this.initialiseSlider("ee", ee, setee)

    // Massé physics parameters
    this.initialiseSlider("magnusCoeff", magnusCoeff, setMagnusCoeff, 0.02)
    this.initialiseSlider("tableRestitution", tableRestitution, setTableRestitution, 1)
    this.initialiseSlider("magnusAirborne", magnusAirborneMultiplier, setMagnusAirborneMultiplier, 10)
    this.initialiseSlider("magnusTable", magnusTableMultiplier, setMagnusTableMultiplier, 2)
  }

  toggleVisibility() {
    this.setVisible(!this.visible)
  }

  setVisible(show: boolean) {
    if (this.visible === show) {
      return
    }
    this.visible = show
    this.applyVisibility()
  }

  isVisible() {
    return this.visible
  }

  private applyVisibility() {
    if (!this.element) {
      return
    }
    this.element.style.visibility = this.visible ? "visible" : "hidden"
  }

  private computeInitialVisibility(): boolean {
    if (!this.element) {
      return false
    }
    if (this.element.style.visibility) {
      return this.element.style.visibility !== "hidden"
    }
    if (typeof window !== "undefined" && window.getComputedStyle) {
      const computed = window.getComputedStyle(this.element)
      return (
        computed.visibility !== "hidden" &&
        computed.display !== "none" &&
        computed.opacity !== "0"
      )
    }
    return false
  }

  getInputElement(id) {
    return (document.getElementById(id) as HTMLInputElement) ?? {}
  }

  initialiseSlider(id, initialValue, setter, max = 1) {
    const slider = this.getInputElement(id)
    if (!slider || !slider.id) {
      console.warn(`Slider not found: ${id}`)
      return
    }
    slider.step = "0.001"
    slider.min = "0.01"
    slider.max = `${max}`
    slider.value = initialValue
    this.showValue(id, initialValue)
    slider.oninput = (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value)
      setter(val)
      this.showValue(id, val)
      // Update lastEventTime to enable throttling
      if (this.container && this.container.lastEventTime !== undefined) {
        this.container.lastEventTime = performance.now()
      }
      this.notify()
    }
  }

  showValue(element, value) {
    const label = document.querySelector(`label[for=${element}]`)
    label && (label.innerHTML = `${element}=${value}`)
  }
}
