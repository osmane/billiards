export class ScoreButtons {
  private whiteScore = 0
  private yellowScore = 0
  private readonly highlightClass = "scoreButton--highlight"

  constructor() {
    this.setupToggle("customBtnLeft")
    this.setupToggle("customBtnRight")
    this.applyScores()
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
