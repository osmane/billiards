export class Chat {
  chatoutput: HTMLElement | null
  chatInput: HTMLElement | null
  chatSend: HTMLElement | null
  chatInputText: HTMLInputElement | null
  send
  container: any
  constructor(send, container = null) {
    this.chatoutput = document.getElementById("chatoutput")
    this.chatInputText = document.getElementById(
      "chatinputtext"
    ) as HTMLInputElement
    this.chatSend = document.getElementById("chatsend")
    this.chatSend?.addEventListener("click", this.sendClicked)
    this.send = send
    this.container = container
  }

  sendClicked = (_) => {
    this.send(this.chatInputText?.value)
    this.showMessage(this.chatInputText?.value)
  }

  showMessage(msg) {
    // Check if we're in 3 cushion mode
    const isThreeCushionMode = this.container?.rules?.rulename === "threecushion"

    if (isThreeCushionMode) {
      // 3 cushion mode: use new score highlight system
      const scoreButtonTarget = this.getScoreButtonTarget(msg)

      if (scoreButtonTarget) {
        // Additional check: Don't route score bead buttons that are just single ⚈ with no actual score
        if (this.shouldFilterScoreButton(msg)) {
          // Send to chatoutput instead of score highlights for invalid score buttons
          this.chatoutput && (this.chatoutput.innerHTML += msg)
        } else {
          this.addToScoreHighlight(scoreButtonTarget, msg)
        }
      } else {
        // Default behavior for non-score buttons
        this.chatoutput && (this.chatoutput.innerHTML += msg)
      }
    } else {
      // Other game modes: use old behavior - everything goes to chatoutput
      this.chatoutput && (this.chatoutput.innerHTML += msg)
    }
    this.updateScroll()
  }

  private shouldFilterScoreButton(msg: string): boolean {
    // Only filter out buttons that have no meaningful content (shouldn't happen with proper events)
    // Let legitimate single ⚈ (break continuation) and ⚆ (replay) buttons through

    // Don't filter any buttons - let the original game logic determine when to show them
    // The issue might be elsewhere in the triggering conditions
    return false
  }

  private getScoreButtonTarget(msg: string): string | null {
    // Check for break and hiscore buttons first
    if (msg.includes('break(') || msg.includes('hi score') || msg.includes('⏹️') || msg.includes('🏆')) {
      // Break and hiscore buttons should be placed based on the cue ball color, not hardcoded positions
      // Extract the color from the message and use the same logic as other buttons
      const colorMatch = msg.match(/style="color:\s*(#[0-9a-fA-F]{6})/)
      if (colorMatch) {
        return this.getTargetFromColor(colorMatch[1])
      }
      // Fallback: if no color found, distribute break buttons to left and hiscore to right
      if (msg.includes('break(') || msg.includes('⏹️')) {
        return "scoreHighlightLeft"
      } else if (msg.includes('hi score') || msg.includes('🏆')) {
        return "scoreHighlightRight"
      }
    }

    // Parse the color from the message to determine which score button it belongs to
    const colorMatch = msg.match(/style="color:\s*(#[0-9a-fA-F]{6})/)
    if (!colorMatch) return null

    return this.getTargetFromColor(colorMatch[1], msg)
  }

  private getTargetFromColor(color: string, msg?: string): string {
    const normalizedColor = color.toLowerCase()

    // Check for specific ball colors
    // White ball: #ffffff (pure white)
    // Yellow ball: #ffd84d or similar yellow tones

    const r = parseInt(normalizedColor.substr(1, 2), 16)
    const g = parseInt(normalizedColor.substr(3, 2), 16)
    const b = parseInt(normalizedColor.substr(5, 2), 16)

    // Check if this is a score button (number or ⚈) vs replay button (⚆) or break/record button
    const isScoreButton = msg ? (msg.includes("⚈") || />\d+</.test(msg)) : false // Contains ⚈ or a number
    const isBreakOrRecordButton = msg ? (msg.includes('break(') || msg.includes('hi score') || msg.includes('⏹️') || msg.includes('🏆')) : false

    // Determine color-based target
    let colorTarget: string

    // Check if it's pure white or very close to white
    if (r >= 240 && g >= 240 && b >= 240) {
      colorTarget = "scoreHighlightRight"  // White score button (RIGHT)
    }
    // Check if it's yellow-ish (high red and green, low blue)
    else if (r >= 200 && g >= 180 && b <= 100) {
      colorTarget = "scoreHighlightLeft"  // Yellow score button (LEFT)
    }
    // For any other colors, try to determine based on color characteristics
    else {
      // If it has more yellow/warm tones, send to yellow; if cooler/neutral, send to white
      const yellowness = (r + g) / 2 - b  // Higher value indicates more yellow
      const whiteness = Math.min(r, g, b)  // Higher value indicates more white/neutral

      if (yellowness > whiteness) {
        colorTarget = "scoreHighlightLeft"  // Yellow score button (LEFT)
      } else {
        colorTarget = "scoreHighlightRight"   // White score button (RIGHT)
      }
    }

    // Apply different logic for different button types
    if (isScoreButton) {
      // Score buttons (numbers or ⚈) need to be reversed
      return colorTarget === "scoreHighlightLeft" ? "scoreHighlightRight" : "scoreHighlightLeft"
    } else if (isBreakOrRecordButton) {
      // Break and Record buttons use direct color mapping (same as the player who achieved them)
      return colorTarget
    } else {
      // Replay buttons (⚆) and other buttons use normal logic
      return colorTarget
    }
  }

  private addToScoreHighlight(targetId: string, msg: string) {
    const target = document.getElementById(targetId)
    if (!target) return

    // Create a button container if it doesn't exist
    if (!target.querySelector('.score-buttons-container')) {
      target.innerHTML = '<div class="score-buttons-container"></div>'
    }

    const container = target.querySelector('.score-buttons-container') as HTMLElement
    if (container) {
      // Add new button at the bottom (appendChild adds to end)
      const buttonDiv = document.createElement('div')
      buttonDiv.innerHTML = msg
      container.appendChild(buttonDiv)

      // Apply font styles from corresponding score button
      this.applyScoreButtonFontToPills(targetId)
    }
  }

  private applyScoreButtonFontToPills(targetId: string) {
    // Determine which score button corresponds to this highlight box
    const scoreButtonId = targetId === "scoreHighlightLeft" ? "customBtnLeft" : "customBtnRight"
    const scoreButton = document.getElementById(scoreButtonId)
    const highlight = document.getElementById(targetId)

    if (!scoreButton || !highlight) return

    const buttonStyles = window.getComputedStyle(scoreButton)

    // Apply font styles to all pills in this highlight box
    const pills = highlight.querySelectorAll('.score-buttons-container a.pill')
    pills.forEach((pill: HTMLElement) => {
      pill.style.fontSize = buttonStyles.fontSize
      pill.style.fontFamily = buttonStyles.fontFamily
      pill.style.fontWeight = 'bold' // Make bold as requested
      pill.style.lineHeight = buttonStyles.lineHeight
    })
  }

  updateScroll() {
    this.chatoutput &&
      (this.chatoutput.scrollTop = this.chatoutput.scrollHeight)
  }

  clearScoreButtons(targetId?: string) {
    if (targetId) {
      const target = document.getElementById(targetId)
      const container = target?.querySelector('.score-buttons-container') as HTMLElement
      if (container) {
        container.innerHTML = ''
      }
    } else {
      // Clear both score highlight boxes
      this.clearScoreButtons("scoreHighlightLeft")
      this.clearScoreButtons("scoreHighlightRight")
    }
  }
}
