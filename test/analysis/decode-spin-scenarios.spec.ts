import { decodeReplay } from "../helpers/threecushionReplay"

const REPLAY_URLS = [
  "http://localhost:8080/?ruletype=threecushion&state=%28%27init%21%5BB%2C%2AK398580312728882DJ61657226085663K22238540649414D0.6610515117645264%5D~shots%21%5B%28%27type%21%27AIM%27~offset%21%28%27xH05263157894736842~yH3262183652286641~zE%29~angle%21-2.723405664443968~powerH73152FFFFF1~pos%21%28%27x%21B~y%21%2A~zE%29~iE~elevationH12217304763960307%29%5D~startCnowCscoreE~wholeGame%21false~v%211%29%2AJ185365438461304B1.19F694370269775C%211760823384561~D%2C-E%210F00HE.J0.49KD1.2%01KJHFEDCB%2A_",
  "http://localhost:8080/?ruletype=threecushion&state=%28%27init%21%5BB%2C%2AK398580312728882DJ61657226085663K22238540649414D0.6610515117645264%5D~shots%21%5B%28%27type%21%27AIM%27~offset%21%28%27xH03508771929824561~yH33206631844503837~zE%29~angle%21-2.723405664443968~powerH73152FFFFF1~pos%21%28%27x%21B~y%21%2A~zE%29~iE~elevationH12217304763960307%29%5D~startCnowCscoreE~wholeGame%21false~v%211%29%2AJ185365438461304B1.19F694370269775C%211760823424674~D%2C-E%210F00HE.J0.49KD1.2%01KJHFEDCB%2A_",
]

describe("Decode spin scenarios", () => {
  it("shows the differences between scenarios", () => {
    const states = REPLAY_URLS.map(decodeReplay)

    console.log("=== Scenario 1 (Shorter Distance) ===")
    console.log("Shot offset (x, y, z):", states[0].shots[0].offset)
    console.log("Shot angle:", states[0].shots[0].angle)
    console.log("Shot power:", states[0].shots[0].power)
    console.log("Shot elevation:", states[0].shots[0].elevation)

    console.log("\n=== Scenario 2 (Longer Distance) ===")
    console.log("Shot offset (x, y, z):", states[1].shots[0].offset)
    console.log("Shot angle:", states[1].shots[0].angle)
    console.log("Shot power:", states[1].shots[0].power)
    console.log("Shot elevation:", states[1].shots[0].elevation)

    console.log("\n=== Differences ===")
    const offsetDiffX = states[1].shots[0].offset.x - states[0].shots[0].offset.x
    const offsetDiffY = states[1].shots[0].offset.y - states[0].shots[0].offset.y
    console.log("Offset X difference:", offsetDiffX)
    console.log("Offset Y difference:", offsetDiffY)
    console.log("Total offset vector difference:", Math.sqrt(offsetDiffX**2 + offsetDiffY**2))
    console.log("Angle difference:", states[1].shots[0].angle - states[0].shots[0].angle)
    console.log("Power difference:", states[1].shots[0].power - states[0].shots[0].power)
    console.log("Elevation difference:", (states[1].shots[0].elevation ?? 0) - (states[0].shots[0].elevation ?? 0))
  })
})
