import {
  AudioListener,
  Audio,
  AudioLoader,
  MathUtils,
  AudioContext,
} from "three"
import { Outcome } from "../model/outcome"

const VOLUME_MULTIPLIER = 10

export class Sound {
  listener: AudioListener
  audioLoader: AudioLoader

  ballcollision
  cue
  cushion
  pot
  success

  lastOutcomeTime = Number.NEGATIVE_INFINITY
  private lastOutcomeIndex = -1
  private lastOutcomeArray: Outcome[] | null = null
  loadAssets

  constructor(loadAssets) {
    this.loadAssets = loadAssets
    if (!loadAssets) {
      return
    }
    this.listener = new AudioListener()
    this.audioLoader = new AudioLoader()

    this.ballcollision = new Audio(this.listener)
    this.load("sounds/ballcollision.ogg", this.ballcollision)

    this.cue = new Audio(this.listener)
    this.load("sounds/cue.ogg", this.cue)

    this.cushion = new Audio(this.listener)
    this.load("sounds/cushion.ogg", this.cushion)

    this.pot = new Audio(this.listener)
    this.load("sounds/pot.ogg", this.pot)

    this.success = new Audio(this.listener)
    this.load("sounds/success.ogg", this.success)
  }

  addCameraToListener(camera) {
    camera.add(this.listener)
  }

  load(path, audio) {
    this.audioLoader.load(
      path,
      (buffer) => {
        audio.setBuffer(buffer)
        audio.setLoop(false)
      },
      (_) => {},
      (_) => {}
    )
  }

  play(audio: Audio, volume, detune = 0) {
    if (this.loadAssets) {
      const context = AudioContext.getContext()
      if (context?.state === "suspended") {
        if (navigator?.userActivation?.hasBeenActive) {
          context.resume()
        }
        return
      }
      audio.setVolume(volume)
      if (audio.isPlaying) {
        audio.stop()
      }
      audio.play(MathUtils.randFloat(0, 0.01))
      audio.setDetune(detune)
    }
  }

  outcomeToSound(outcome) {
    if (outcome.type === "Collision") {
      this.play(this.ballcollision, outcome.incidentSpeed / 10 * VOLUME_MULTIPLIER,
        outcome.incidentSpeed * 5
      )
    }
    if (outcome.type === "Pot") {
      this.play(this.pot, outcome.incidentSpeed / 10 * VOLUME_MULTIPLIER,
        -1000 + outcome.incidentSpeed * 10
      )
    }
    if (outcome.type === "Cushion") {
      this.play(this.cushion, outcome.incidentSpeed / 90 * VOLUME_MULTIPLIER)
    }
    if (outcome.type === "Hit") {
      this.play(this.cue, outcome.incidentSpeed / 30 * VOLUME_MULTIPLIER)
    }
  }

  processOutcomes(outcomes: Outcome[]) {
    if (!outcomes || outcomes.length === 0) {
      return
    }

    if (this.lastOutcomeArray !== outcomes) {
      // New shot replaces the array, so reset the playback cursor.
      this.lastOutcomeArray = outcomes
      this.lastOutcomeTime = Number.NEGATIVE_INFINITY
      this.lastOutcomeIndex = -1
    } else if (this.lastOutcomeIndex >= outcomes.length) {
      this.lastOutcomeIndex = outcomes.length - 1
    }

    // Track index alongside timestamp so simultaneous outcomes still play once.
    for (let i = this.lastOutcomeIndex + 1; i < outcomes.length; i++) {
      const outcome = outcomes[i]
      if (
        outcome.timestamp > this.lastOutcomeTime ||
        (outcome.timestamp === this.lastOutcomeTime && i > this.lastOutcomeIndex)
      ) {
        this.lastOutcomeTime = outcome.timestamp
        this.lastOutcomeIndex = i
        this.outcomeToSound(outcome)
        break
      }
    }
  }

  playNotify() {
    this.play(this.pot, 1)
  }

  playSuccess(pitch) {
    this.play(this.success, 0.1, pitch * 100 - 2200)
  }
}









