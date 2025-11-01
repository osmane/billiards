import { expect } from "chai"
import { initDom, canvas3d } from "../view/dom"
import {
  decodeReplay,
  prepareThreeCushionEnvironment,
  simulateThreeCushionScenario,
} from "../helpers/threecushionReplay"
import { CAROM_BALL_DIAMETER } from "../../src/model/physics/constants"

const REPLAY_URLS = [
  "http://localhost:8080/?ruletype=threecushion&state=%28%27init%21%5BB%2C%2AK398580312728882DJ61657226085663K22238540649414D0.6610515117645264%5D~shots%21%5B%28%27type%21%27AIM%27~offset%21%28%27xH05263157894736842~yH3262183652286641~zE%29~angle%21-2.723405664443968~powerH73152FFFFF1~pos%21%28%27x%21B~y%21%2A~zE%29~iE~elevationH12217304763960307%29%5D~startCnowCscoreE~wholeGame%21false~v%211%29%2AJ185365438461304B1.19F694370269775C%211760823384561~D%2C-E%210F00HE.J0.49KD1.2%01KJHFEDCB%2A_",
  "http://localhost:8080/?ruletype=threecushion&state=%28%27init%21%5BB%2C%2AK398580312728882DJ61657226085663K22238540649414D0.6610515117645264%5D~shots%21%5B%28%27type%21%27AIM%27~offset%21%28%27xH03508771929824561~yH33206631844503837~zE%29~angle%21-2.723405664443968~powerH73152FFFFF1~pos%21%28%27x%21B~y%21%2A~zE%29~iE~elevationH12217304763960307%29%5D~startCnowCscoreE~wholeGame%21false~v%211%29%2AJ185365438461304B1.19F694370269775C%211760823424674~D%2C-E%210F00HE.J0.49KD1.2%01KJHFEDCB%2A_",
]

describe("Three-cushion replay parity with product simulator", () => {
  beforeAll(() => {
    initDom()
    prepareThreeCushionEnvironment()
  })

  it("matches product-scale displacement between replay scenarios", () => {
    const states = REPLAY_URLS.map(decodeReplay)
    const [scenarioOne, scenarioTwo] = states.map((state) =>
      simulateThreeCushionScenario(canvas3d, state)
    )

    const cueBallDiametersDiff =
      scenarioTwo.finalPos.clone().sub(scenarioOne.finalPos).length() /
      CAROM_BALL_DIAMETER

    console.log("Product replay cue-ball displacement (diameters):", cueBallDiametersDiff)

    expect(cueBallDiametersDiff).to.be.greaterThan(10)
  })
})

