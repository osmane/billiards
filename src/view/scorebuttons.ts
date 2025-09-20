export class ScoreButtons {
  private whiteScore = 0
  private yellowScore = 0
  private readonly highlightClass = "scoreButton--highlight"

  constructor() {
    this.setupToggle("customBtnLeft")
    this.setupToggle("customBtnRight")
    this.applyScores()
    this.setupWindowResize()
    this.setupClickOutside()
  }

  setScores(white: number, yellow: number) {
    this.whiteScore = white
    this.yellowScore = yellow
    this.applyScores()
  }

  private applyScores() {
    if (typeof document === "undefined") {
      return
    }
    this.updateButton("customBtnLeft", this.whiteScore, "White Score")
    this.updateButton("customBtnRight", this.yellowScore, "Yellow Score")
  }

  private setupToggle(id: string) {
    if (typeof document === "undefined") {
      return
    }
    const element = document.getElementById(id)
    if (!(element instanceof HTMLButtonElement)) {
      return
    }
    element.addEventListener("click", (event) => {
      event.stopPropagation() // Prevent click from bubbling up
      // Close any other open highlight box first
      this.closeAllHighlights()
      // Then open this one
      element.classList.add(this.highlightClass)
      this.updateHighlightPosition(id, true)
    })
  }

  private updateHighlightPosition(buttonId: string, isVisible: boolean) {
    if (typeof document === "undefined") {
      return
    }

    const highlightId = buttonId === "customBtnLeft" ? "scoreHighlightLeft" : "scoreHighlightRight"
    const highlight = document.getElementById(highlightId)
    const button = document.getElementById(buttonId)

    if (!highlight || !button) {
      return
    }

    if (isVisible) {
      const buttonRect = button.getBoundingClientRect()
      const buttonStyles = window.getComputedStyle(button)

      // Match exact width and positioning
      highlight.style.display = "block"
      highlight.style.width = `${buttonRect.width}px`
      highlight.style.left = `${buttonRect.left}px`
      highlight.style.top = `${buttonRect.top - highlight.offsetHeight - 2}px` // 2px above the button

      // Copy font properties to pills inside this highlight box
      this.updatePillFonts(highlightId, buttonStyles)
    } else {
      highlight.style.display = "none"
      // Don't clear content when hiding - preserve the buttons for when it's shown again
    }
  }

  private updatePillFonts(highlightId: string, buttonStyles: CSSStyleDeclaration) {
    if (typeof document === "undefined") {
      return
    }

    const highlight = document.getElementById(highlightId)
    if (!highlight) return

    // Apply font styles to all pills in this highlight box
    const pills = highlight.querySelectorAll('.score-buttons-container a.pill')
    pills.forEach((pill: HTMLElement) => {
      pill.style.fontSize = buttonStyles.fontSize
      pill.style.fontFamily = buttonStyles.fontFamily
      pill.style.fontWeight = 'bold' // Make bold as requested
      pill.style.lineHeight = buttonStyles.lineHeight
    })
  }

  private setupWindowResize() {
    if (typeof window === "undefined") {
      return
    }
    window.addEventListener("resize", () => {
      // Update positions of visible highlights
      this.updateHighlightPosition("customBtnLeft", document.getElementById("customBtnLeft")?.classList.contains(this.highlightClass) ?? false)
      this.updateHighlightPosition("customBtnRight", document.getElementById("customBtnRight")?.classList.contains(this.highlightClass) ?? false)
    })
  }

  private setupClickOutside() {
    if (typeof document === "undefined") {
      return
    }
    // Close highlight boxes when clicking anywhere on the document
    document.addEventListener("click", (event) => {
      this.closeAllHighlights()
    })

    // Prevent closing when clicking on highlight boxes themselves
    const leftHighlight = document.getElementById("scoreHighlightLeft")
    const rightHighlight = document.getElementById("scoreHighlightRight")

    leftHighlight?.addEventListener("click", (event) => {
      event.stopPropagation()
    })

    rightHighlight?.addEventListener("click", (event) => {
      event.stopPropagation()
    })
  }

  private closeAllHighlights() {
    const leftBtn = document.getElementById("customBtnLeft")
    const rightBtn = document.getElementById("customBtnRight")

    if (leftBtn) {
      leftBtn.classList.remove(this.highlightClass)
      this.updateHighlightPosition("customBtnLeft", false)
    }

    if (rightBtn) {
      rightBtn.classList.remove(this.highlightClass)
      this.updateHighlightPosition("customBtnRight", false)
    }
  }

  private updateButton(id: string, score: number, label: string) {
    const element = document.getElementById(id)
    if (!(element instanceof HTMLButtonElement)) {
      return
    }
    element.textContent = score.toString()
    element.setAttribute("aria-label", `${label}: ${score}`)
  }
}
