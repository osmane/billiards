import { Container } from "../container/container"
import JSONCrush from "jsoncrush"
import { BreakEvent } from "../events/breakevent"
import { ChatEvent } from "../events/chatevent"
import { StationaryEvent } from "../events/stationaryevent"
import { share, shorten } from "../utils/shorten"
import { NpcBot } from "../controller/npc"
import type { NpcConfig } from "../controller/npc"

export class Menu {
  container: Container
  redo: HTMLButtonElement
  share: HTMLButtonElement
  replay: HTMLButtonElement
  camera: HTMLButtonElement
  npc: HTMLButtonElement | null = null
  npcMenuPanel: HTMLElement | null = null
  npcMenuEntry: HTMLButtonElement | null = null
  private npcPanelVisible = false
  menuToggle: HTMLButtonElement | null
  menuPanel: HTMLElement | null

  private menuPanelVisible = false
  private handleOutsideClick = (event: MouseEvent) => {
    if (!this.menuPanelVisible) {
      return
    }
    const target = event.target as Node
    // Do not close the menu if clicking inside NPC panel
    if (this.npcMenuPanel && this.npcMenuPanel.contains(target)) {
      return
    }
    this.setMenuPanelVisibility(false)
  }
  private handleEscapeKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      this.setMenuPanelVisibility(false)
    }
  }
  private handlePanelSelection = () => {
    this.setMenuPanelVisibility(false)
  }
  disabled = true

  constructor(container) {
    this.container = container

    this.replay = this.getElement("replay")
    this.redo = this.getElement("redo")
    this.share = this.getElement("share")
    this.camera = this.getElement("camera")
    this.npc = document.getElementById("npc") as HTMLButtonElement | null
    this.menuToggle = document.getElementById("mainMenuToggle") as HTMLButtonElement | null
    this.menuPanel = document.getElementById("mainMenuPanel")

    this.setupMenuPanel()
    this.setupNpcMenu()
    this.updateNpcVisibility()

    if (this.camera) {
      this.setMenu(true)
      this.camera.onclick = (_) => {
        this.adjustCamera()
      }
    }

    if (this.npc) {
      // Simple click: immediate NPC shot
      this.npc.onclick = (_) => {
        if (!this.container.table.allStationary()) return
        NpcBot.takeShot(this.container)
        this.setMenuPanelVisibility(false)
      }
    }
  }

  setMenu(disabled) {
    this.replay.disabled = disabled
    this.redo.disabled = disabled
    if (this.share) {
      this.share.disabled = disabled
    }
    if (disabled) {
      this.setMenuPanelVisibility(false)
    }
  }

  adjustCamera() {
    this.container.view.camera.toggleMode()
    this.container.lastEventTime = performance.now()
  }

  replayMode(url, breakEvent: BreakEvent) {
    if (!this.replay) {
      return
    }

    this.setMenu(false)
    // Show retry button only in replay mode
    this.redo.style.display = ""
    const queue = this.container.eventQueue
    this.bindShare(() => {
      shorten(url, (shortUrl) => {
        const response = share(shortUrl)
        queue.push(new ChatEvent(null, response))
      })
    })
    this.redo.onclick = (_) => {
      const redoEvent = new BreakEvent(breakEvent.init, breakEvent.shots)
      redoEvent.retry = true
      this.interuptEventQueue(redoEvent)
    }
    this.replay.onclick = (_) => {
      this.interuptEventQueue(breakEvent)
    }
  }

  aimMode() {
    if (!this.replay) {
      return
    }

    // Hide retry button in normal game mode
    this.redo.style.display = "none"

    // In aim mode, allow replaying the most recent recorded shot
    const canReplay = this.canReplayLastShot()
    this.replay.disabled = !canReplay
    this.share.disabled = true
    this.redo.disabled = true

    this.replay.onclick = (_) => {
      // Only allow replay when balls are stationary to prevent conflicts
      if (!this.container.table.allStationary()) {
        return
      }

      this.replayLastRecordedShot()
    }
  }

  private setupMenuPanel() {
    if (!this.menuToggle || !this.menuPanel) {
      return
    }

    this.menuToggle.addEventListener("click", (event) => {
      event.stopPropagation()
      this.toggleMenuPanel()
    })

    this.menuPanel.addEventListener("click", (event) => {
      event.stopPropagation()
    })

    document.addEventListener("click", this.handleOutsideClick)
    document.addEventListener("keydown", this.handleEscapeKey)

    const selectableItems = this.menuPanel.querySelectorAll("a, button")
    selectableItems.forEach((item) => {
      // Keep menu open for items explicitly marked to keep panel visible (e.g., NPC Options)
      if ((item as HTMLElement).getAttribute("data-keep-open") === "true") {
        return
      }
      item.addEventListener("click", this.handlePanelSelection)
      item.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.key === "Enter" || event.key === " ") {
          this.handlePanelSelection()
        }
      })
    })
  }

  private toggleMenuPanel(force?: boolean) {
    const targetState =
      typeof force === "boolean" ? force : !this.menuPanelVisible
    this.setMenuPanelVisibility(targetState)
  }

  private setMenuPanelVisibility(visible: boolean) {
    this.menuPanelVisible = visible
    if (!this.menuPanel || !this.menuToggle) {
      return
    }

    this.menuPanel.classList.toggle("is-visible", visible)
    this.menuPanel.setAttribute("aria-hidden", visible ? "false" : "true")
    this.menuToggle.setAttribute("aria-expanded", visible ? "true" : "false")
  }

  private bindShare(handler: () => void) {
    if (!this.share) {
      return
    }
    this.share.onclick = (_) => {
      handler()
      this.setMenuPanelVisibility(false)
    }
  }

  // ---------- NPC Menu Panel ----------
  private setupNpcMenu() {
    // Insert an entry at top of main menu
    if (!this.menuPanel) return
    const npcEntry = document.createElement("button")
    npcEntry.className = "menuPanel__action"
    npcEntry.textContent = "NPC Options"
    npcEntry.setAttribute("data-keep-open", "true")
    npcEntry.onclick = (ev) => {
      ev.stopPropagation()
      this.toggleNpcMenuPanel(true)
    }
    // Insert at top
    this.menuPanel.insertBefore(npcEntry, this.menuPanel.firstChild)
    // Store reference for visibility control
    this.npcMenuEntry = npcEntry

    // Create NPC options side panel attached to body (fixed positioning)
    const panel = document.createElement("div")
    panel.id = "npcMenuPanel"
    panel.className = "npcPanel"
    panel.setAttribute("aria-hidden", "true")

    const title = document.createElement("div")
    title.className = "menuPanel__link"
    title.textContent = "NPC Ayarları"
    panel.appendChild(title)

    const mkRow = (labelText: string, input: HTMLElement, valueLabel?: HTMLElement) => {
      const row = document.createElement("div")
      row.style.display = "flex"
      row.style.alignItems = "center"
      row.style.gap = "8px"
      const lab = document.createElement("span")
      lab.textContent = labelText
      lab.style.minWidth = "120px"
      row.appendChild(lab)
      row.appendChild(input)
      if (valueLabel) row.appendChild(valueLabel)
      panel.appendChild(row)
    }

    const cfg = this.getNpcConfig()

    // Enable constraints toggle
    const enableRow = document.createElement("div")
    enableRow.style.display = "flex"
    enableRow.style.alignItems = "center"
    enableRow.style.gap = "8px"
    const enableLbl = document.createElement("label")
    enableLbl.textContent = "Kısıtlamaları etkinleştir"
    const enableChk = document.createElement("input") as HTMLInputElement
    enableChk.type = "checkbox"
    enableChk.checked = (cfg as any).enabled === true
    enableRow.appendChild(enableLbl)
    enableRow.appendChild(enableChk)
    panel.appendChild(enableRow)

    // Elevation sliders (degrees)
    const elevMin = document.createElement("input") as HTMLInputElement
    elevMin.type = "range"; elevMin.min = "0"; elevMin.max = "90"; elevMin.step = "0.5"
    const elevMax = document.createElement("input") as HTMLInputElement
    elevMax.type = "range"; elevMax.min = "0"; elevMax.max = "90"; elevMax.step = "0.5"
    const elevMinVal = document.createElement("span")
    const elevMaxVal = document.createElement("span")

    const rad2deg = (r: number) => (r * 180) / Math.PI
    const deg2rad = (d: number) => (d * Math.PI) / 180
    elevMin.value = rad2deg(cfg.minElevation).toFixed(1)
    elevMax.value = rad2deg(cfg.maxElevation).toFixed(1)
    elevMinVal.textContent = `${parseFloat(elevMin.value)}°`
    elevMaxVal.textContent = `${parseFloat(elevMax.value)}°`

    mkRow("Min Elevation", elevMin, elevMinVal)
    mkRow("Max Elevation", elevMax, elevMaxVal)

    const syncElev = () => {
      let minD = parseFloat(elevMin.value)
      let maxD = parseFloat(elevMax.value)
      if (minD > maxD) [minD, maxD] = [maxD, minD]
      elevMin.value = minD.toFixed(1); elevMax.value = maxD.toFixed(1)
      elevMinVal.textContent = `${minD}°`; elevMaxVal.textContent = `${maxD}°`
      cfg.minElevation = deg2rad(minD); cfg.maxElevation = deg2rad(maxD)
      this.setNpcConfig(cfg)
    }
    elevMin.oninput = syncElev
    elevMax.oninput = syncElev

    // Power sliders (percent)
    const pMin = document.createElement("input") as HTMLInputElement
    pMin.type = "range"; pMin.min = "0"; pMin.max = "100"; pMin.step = "1"
    const pMax = document.createElement("input") as HTMLInputElement
    pMax.type = "range"; pMax.min = "0"; pMax.max = "100"; pMax.step = "1"
    const pMinVal = document.createElement("span")
    const pMaxVal = document.createElement("span")
    pMin.value = Math.round(cfg.minPowerPct * 100).toString()
    pMax.value = Math.round(cfg.maxPowerPct * 100).toString()
    pMinVal.textContent = `${pMin.value}%`; pMaxVal.textContent = `${pMax.value}%`
    mkRow("Min Power", pMin, pMinVal)
    mkRow("Max Power", pMax, pMaxVal)
    const syncPower = () => {
      let mi = parseInt(pMin.value, 10)
      let ma = parseInt(pMax.value, 10)
      if (mi > ma) [mi, ma] = [ma, mi]
      pMin.value = String(mi); pMax.value = String(ma)
      pMinVal.textContent = `${mi}%`; pMaxVal.textContent = `${ma}%`
      cfg.minPowerPct = mi / 100; cfg.maxPowerPct = ma / 100
      this.setNpcConfig(cfg)
    }
    pMin.oninput = syncPower
    pMax.oninput = syncPower

    // Spin distance sliders (percent of radius)
    const sMin = document.createElement("input") as HTMLInputElement
    sMin.type = "range"; sMin.min = "0"; sMin.max = "100"; sMin.step = "1"
    const sMax = document.createElement("input") as HTMLInputElement
    sMax.type = "range"; sMax.min = "0"; sMax.max = "100"; sMax.step = "1"
    const sMinVal = document.createElement("span")
    const sMaxVal = document.createElement("span")
    sMin.value = Math.round(cfg.minSpin * 100).toString()
    sMax.value = Math.round(cfg.maxSpin * 100).toString()
    sMinVal.textContent = `${sMin.value}%`; sMaxVal.textContent = `${sMax.value}%`
    mkRow("Min Spin Dist.", sMin, sMinVal)
    mkRow("Max Spin Dist.", sMax, sMaxVal)
    const syncSpin = () => {
      let mi = parseInt(sMin.value, 10)
      let ma = parseInt(sMax.value, 10)
      if (mi > ma) [mi, ma] = [ma, mi]
      sMin.value = String(mi); sMax.value = String(ma)
      sMinVal.textContent = `${mi}%`; sMaxVal.textContent = `${ma}%`
      cfg.minSpin = mi / 100; cfg.maxSpin = ma / 100
      this.setNpcConfig(cfg)
    }
    sMin.oninput = syncSpin
    sMax.oninput = syncSpin

    // Avoid Kiss (strict) checkbox
    const chkKiss = document.createElement("input") as HTMLInputElement
    chkKiss.type = "checkbox"; chkKiss.checked = !!cfg.avoidKissStrict
    const chkLbl = document.createElement("label")
    chkLbl.textContent = "Kiss'i yasakla"
    const kissRow = document.createElement("div")
    kissRow.style.display = "flex"; kissRow.style.alignItems = "center"; kissRow.style.gap = "8px"
    kissRow.appendChild(chkLbl); kissRow.appendChild(chkKiss)
    panel.appendChild(kissRow)
    chkKiss.onchange = () => { cfg.avoidKissStrict = chkKiss.checked; this.setNpcConfig(cfg) }

    // Search density select
    const densityRow = document.createElement("div")
    densityRow.style.display = "flex"; densityRow.style.alignItems = "center"; densityRow.style.gap = "8px"
    const denLbl = document.createElement("span"); denLbl.textContent = "Arama Yoğunluğu"
    const sel = document.createElement("select") as HTMLSelectElement
    ;["low","medium","high"].forEach(k => {
      const opt = document.createElement("option")
      opt.value = k; opt.text = k
      sel.appendChild(opt)
    })
    sel.value = cfg.searchDensity
    sel.onchange = () => { cfg.searchDensity = sel.value as any; this.setNpcConfig(cfg) }
    densityRow.appendChild(denLbl); densityRow.appendChild(sel)
    panel.appendChild(densityRow)

    // Enable/Disable dependent inputs
    const setEnabled = (enabled: boolean) => {
      elevMin.disabled = elevMax.disabled = !enabled
      pMin.disabled = pMax.disabled = !enabled
      sMin.disabled = sMax.disabled = !enabled
      chkKiss.disabled = !enabled
      sel.disabled = !enabled
      // Visual hint
      panel.classList.toggle("is-disabled", !enabled)
    }
    setEnabled(enableChk.checked)
    enableChk.onchange = () => { (cfg as any).enabled = enableChk.checked; this.setNpcConfig(cfg); setEnabled(enableChk.checked) }

    // No action buttons. Panel closes only on outside click or ESC.

    document.body.appendChild(panel)
    this.npcMenuPanel = panel

    // Outside click / Escape handling
    document.addEventListener("click", (ev) => {
      if (!this.npcPanelVisible) return
      if (!this.npcMenuPanel) return
      const target = ev.target as Node
      if (!this.npcMenuPanel.contains(target)) {
        this.toggleNpcMenuPanel(false)
      }
    })
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && this.npcPanelVisible) {
        this.toggleNpcMenuPanel(false)
      }
    })
  }

  private toggleNpcMenuPanel(force?: boolean) {
    if (!this.npcMenuPanel || !this.menuPanel) return
    const newState = typeof force === "boolean" ? force : !this.npcPanelVisible
    this.npcPanelVisible = newState
    this.npcMenuPanel.classList.toggle("is-visible", newState)
    this.npcMenuPanel.setAttribute("aria-hidden", newState ? "false" : "true")
    if (newState) {
      // Position next to main menu panel
      const rect = this.menuPanel.getBoundingClientRect()
      this.npcMenuPanel.style.top = `${Math.max(6, rect.top)}px`
      // Reset conflicting base styles from .menuPanel (absolute bottom)
      this.npcMenuPanel.style.bottom = "auto"
      this.npcMenuPanel.style.right = "auto"
      // Default place to the right of main menu
      let panelLeft = rect.right + 8
      // Ensure within viewport
      const viewportW = (typeof window !== 'undefined') ? window.innerWidth : 1024
      // Measure actual panel width if visible; fall back to a sane default
      const measured = this.npcMenuPanel.getBoundingClientRect().width
      const desiredWidth = measured && measured > 0 ? measured : 360
      if (panelLeft + desiredWidth > viewportW - 6) {
        panelLeft = Math.max(6, rect.left - desiredWidth - 8)
      }
      this.npcMenuPanel.style.left = `${panelLeft}px`
      // Ensure inline display is not blocking CSS class
      this.npcMenuPanel.style.display = "flex"
    } else {
      this.npcMenuPanel.style.display = "none"
    }
  }


  private getNpcConfig(): NpcConfig {
    return ((this.container as any).npcConfig as NpcConfig) ?? NpcBot.getDefaultConfig(this.container)
  }

  private setNpcConfig(cfg: NpcConfig) {
    ;(this.container as any).npcConfig = cfg
  }

  private replayLastRecordedShot() {
    if (!this.canReplayLastShot()) {
      return
    }

    const recorder = this.container.recorder
    if (!recorder) {
      return
    }

    const lastShotState = recorder.lastShot()
    if (!this.isValidShotState(lastShotState)) {
      return
    }

    const replayUrl = this.buildReplayUrlFromState(lastShotState)
    if (!replayUrl) {
      return
    }

    window.open(replayUrl, "_blank", "noopener")
    this.setMenuPanelVisibility(false)
  }

  private isValidShotState(
    state: any
  ): state is {
    init: unknown
    shots: unknown[]
  } {
    return (
      !!state &&
      !!state.init &&
      Array.isArray(state.shots) &&
      state.shots.length > 0
    )
  }

  private canReplayLastShot(): boolean {
    const recorder = this.container.recorder
    if (!recorder || !recorder.replayUrl) {
      return false
    }
    return recorder.shots.length > 0
  }

  private buildReplayUrlFromState(state): string | null {
    const recorder = this.container.recorder
    const prefix = recorder?.replayUrl
    if (!prefix) {
      return null
    }

    const serialised = JSON.stringify(state)
    const compressed = JSONCrush.crush(serialised)
    const encoded = encodeURIComponent(compressed)
      .replace(/\(/g, "%28")
      .replace(/\)/g, "%29")
      .replace(/\!/g, "%21")
      .replace(/\*/g, "%2A")

    return `${prefix}${encoded}`
  }

  interuptEventQueue(breakEvent: BreakEvent) {
    this.container.table.halt()
    const queue = this.container.eventQueue
    queue.length = 0
    queue.push(new StationaryEvent())
    queue.push(breakEvent)
  }

  getElement(id): HTMLButtonElement {
    return document.getElementById(id)! as HTMLButtonElement
  }

  /**
   * Show NPC button and options only in single player mode
   */
  updateNpcVisibility() {
    const single = !!this.container?.isSinglePlayer

    // Hide/show NPC button on main screen
    if (this.npc) {
      this.npc.style.display = single ? "" : "none"
    }

    // Hide/show NPC Options entry in menu
    if (this.npcMenuEntry) {
      this.npcMenuEntry.style.display = single ? "" : "none"
    }

    // Close NPC panel if it's open and we're switching to multiplayer
    if (!single && this.npcPanelVisible) {
      this.toggleNpcMenuPanel(false)
    }
  }
}
