export class ScoreButtons {
  private whiteScore = 0
  private yellowScore = 0
  private readonly highlightClass = "scoreButton--highlight"
  private container: any

  constructor(container = null) {
    this.container = container
    this.setupToggle("customBtnLeft")
    this.setupToggle("customBtnRight")
    this.applyScores()
    this.setupWindowResize()
    this.setupClickOutside()
    // Delay visibility check to ensure game rules are properly initialized
    setTimeout(() => {
      this.updateVisibilityBasedOnGameMode()
    }, 100)
  }

  setScores(white: number, yellow: number) {
    this.whiteScore = white
    this.yellowScore = yellow
    this.applyScores()
  }

  updateGameModeVisibility() {
    this.updateVisibilityBasedOnGameMode()
  }

  // Method to reinitialize event handlers (needed after DOM state changes)
  reinitializeEventHandlers() {
    this.setupToggle("customBtnLeft")
    this.setupToggle("customBtnRight")
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

    // Remove any existing click listeners by cloning the element
    const newElement = element.cloneNode(true) as HTMLButtonElement
    element.parentNode?.replaceChild(newElement, element)

    newElement.addEventListener("click", (event) => {
      event.stopPropagation() // Prevent click from bubbling up

      // Check if this button's highlight is currently visible
      const isCurrentlyHighlighted = newElement.classList.contains(this.highlightClass)

      if (isCurrentlyHighlighted) {
        // If already highlighted, toggle it off (hide)
        newElement.classList.remove(this.highlightClass)
        this.updateHighlightPosition(id, false)
      } else {
        // If not highlighted, close any other open highlight box first
        this.closeAllHighlights()
        // Then open this one
        newElement.classList.add(this.highlightClass)
        this.updateHighlightPosition(id, true)
      }
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

  private updateVisibilityBasedOnGameMode() {
    if (typeof document === "undefined") {
      return
    }

    const isThreeCushionMode = this.container?.rules?.rulename === "threecushion"

    // Get all score-related elements
    const scoreButtons = [
      document.getElementById("customBtnLeft"),
      document.getElementById("customBtnRight")
    ]

    const highlightBoxes = [
      document.getElementById("scoreHighlightLeft"),
      document.getElementById("scoreHighlightRight")
    ]

    const targetButton = document.getElementById("targetButton")

    // Show/hide based on game mode
    scoreButtons.forEach((button, index) => {
      if (button) {
        const display = isThreeCushionMode ? "block" : "none"
        button.style.display = display
      }
    })

    highlightBoxes.forEach((box, index) => {
      if (box) {
        box.style.display = "none" // Always start hidden, will be shown by toggle if needed
        // But remove from flow in non-3cushion modes
        if (!isThreeCushionMode) {
          box.style.visibility = "hidden"
        } else {
          box.style.visibility = "visible"
        }
      }
    })

    // Show/hide target button based on game mode
    if (targetButton) {
      targetButton.style.display = isThreeCushionMode ? "block" : "none"
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
