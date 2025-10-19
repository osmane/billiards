import { expect } from "chai"
import { initDom, canvas3d } from "../view/dom"
import {
  decodeReplay,
  prepareThreeCushionEnvironment,
  simulateThreeCushionScenario,
} from "../helpers/threecushionReplay"

const REPLAY_URLS = [
  "http://localhost:8080/?ruletype=threecushion&state=%28%27init%21%5BB%2C%2AK398580312728882DJ61657226085663K22238540649414D0.6610515117645264%5D~shots%21%5B%28%27type%21%27AIM%27~offset%21%28%27xH05263157894736842~yH3262183652286641~zE%29~angle%21-2.723405664443968~powerH73152FFFFF1~pos%21%28%27x%21B~y%21%2A~zE%29~iE~elevationH12217304763960307%29%5D~startCnowCscoreE~wholeGame%21false~v%211%29%2AJ185365438461304B1.19F694370269775C%211760823384561~D%2C-E%210F00HE.J0.49KD1.2%01KJHFEDCB%2A_",
  "http://localhost:8080/?ruletype=threecushion&state=%28%27init%21%5BB%2C%2AK398580312728882DJ61657226085663K22238540649414D0.6610515117645264%5D~shots%21%5B%28%27type%21%27AIM%27~offset%21%28%27xH03508771929824561~yH33206631844503837~zE%29~angle%21-2.723405664443968~powerH73152FFFFF1~pos%21%28%27x%21B~y%21%2A~zE%29~iE~elevationH12217304763960307%29%5D~startCnowCscoreE~wholeGame%21false~v%211%29%2AJ185365438461304B1.19F694370269775C%211760823424674~D%2C-E%210F00HE.J0.49KD1.2%01KJHFEDCB%2A_",
]

describe("Three-cushion spin sensitivity vs product replay", () => {
  beforeAll(() => {
    initDom()
    prepareThreeCushionEnvironment()
  })

  it("captures travel, duration and final states for both replay URLs", () => {
    const states = REPLAY_URLS.map(decodeReplay)
    const results = states.map((state) =>
      simulateThreeCushionScenario(canvas3d, state, 30, 1 / 60)
    )

    results.forEach((result, idx) => {
      console.log(
        `Scenario ${idx + 1}: distance=${result.distance.toFixed(
          4
        )}m, duration=${result.duration.toFixed(3)}s, finalSpeed=${result.finalVel.toFixed(
          5
        )}, finalSpin=${result.finalSpin.toFixed(5)}, state=${result.finalState}`
      )
    })

    const distanceDiff = Math.abs(results[0].distance - results[1].distance)
    const durationDiff = Math.abs(results[0].duration - results[1].duration)

    console.log(
      `Travel difference: ${distanceDiff.toFixed(4)}m (${(
        (distanceDiff / results[0].distance) *
        100
      ).toFixed(2)}%), duration diff: ${durationDiff.toFixed(3)}s`
    )

    expect(results.length).to.equal(2)
  })
})

