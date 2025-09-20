export class ScoreButtons {
  private whiteScore = 0
  private yellowScore = 0
  private readonly highlightClass = "scoreButton--highlight"

  constructor() {
    this.setupToggle("customBtnLeft")
    this.setupToggle("customBtnRight")
    this.applyScores()
    this.setupWindowResize()
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
    element.addEventListener("click", () => {
      element.classList.toggle(this.highlightClass)
      this.updateHighlightPosition(id, element.classList.contains(this.highlightClass))
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
      highlight.style.display = "block"
      highlight.style.left = `${buttonRect.left}px`
      highlight.style.top = `${buttonRect.top - highlight.offsetHeight - 2}px` // 2px above the button
    } else {
      highlight.style.display = "none"
      // Don't clear content when hiding - preserve the buttons for when it's shown again
    }
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

  private updateButton(id: string, score: number, label: string) {
    const element = document.getElementById(id)
    if (!(element instanceof HTMLButtonElement)) {
      return
    }
    element.textContent = score.toString()
    element.setAttribute("aria-label", `${label}: ${score}`)
  }
}
