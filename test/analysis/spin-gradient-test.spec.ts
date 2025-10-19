@@ -0,0 +1,74 @@
+import { expect } from "chai"
+import { initDom, canvas3d } from "../view/dom"
+import {
+  prepareThreeCushionEnvironment,
+  simulateThreeCushionScenario,
+  ReplayState,
+} from "../helpers/threecushionReplay"
+
+// Base scenario from the first replay URL
+const BASE_STATE: ReplayState = {
+  init: [1.19, 0.49185365438461304, 1.2398580312728882, 0.4961657226085663, 1.2022238540649414, -0.6610515117645264],
+  shots: [{
+    type: "AIM",
+    offset: { x: 0.05, y: 0.32, z: 0 },  // Will be varied
+    angle: -2.723405664443968,
+    power: 0.7315200000000001,
+    pos: { x: 1.19, y: 0.49185365438461304, z: 0 },
+    i: 0,
+    elevation: 0.12217304763960307
+  }]
+}
+
+describe("Spin offset gradient test for three-cushion physics", () => {
+  beforeAll(() => {
+    initDom()
+    prepareThreeCushionEnvironment()
+  })
+
+  it("measures distance vs offset-x with fixed offset-y", () => {
+    console.log("\n" + "=".repeat(80))
+    console.log("SPIN GRADIENT TEST: Distance vs Offset-X")
+    console.log("=".repeat(80))
+    console.log("Base: offset-y = 0.32, power = 0.7315, varying offset-x from 0.01 to 0.35")
+    console.log("-".repeat(80))
+    console.log("Offset-X | Distance (m) | Duration (s) | Delta-Dist | Delta-%")
+    console.log("-".repeat(80))
+
+    const offsetXValues = [0.01, 0.03, 0.05, 0.07, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35]
+    const results: Array<{ offsetX: number; distance: number; duration: number }> = []
+
+    for (const offsetX of offsetXValues) {
+      const state = JSON.parse(JSON.stringify(BASE_STATE)) as ReplayState
+      state.shots[0].offset.x = offsetX
+
+      const result = simulateThreeCushionScenario(canvas3d, state, 30, 1 / 60)
+      results.push({
+        offsetX,
+        distance: result.distance,
+        duration: result.duration,
+      })
+    }
+
+    // Print table
+    for (let i = 0; i < results.length; i++) {
+      const { offsetX, distance, duration } = results[i]
+      if (i === 0) {
+        console.log(
+          `${offsetX.toFixed(2).padStart(8)} | ${distance.toFixed(4).padStart(12)} | ${duration.toFixed(3).padStart(12)} | ${"-".padStart(10)} | ${"-".padStart(7)}`
+        )
+      } else {
+        const deltaDist = distance - results[i - 1].distance
+        const deltaPercent = (deltaDist / results[i - 1].distance) * 100
+        console.log(
+          `${offsetX.toFixed(2).padStart(8)} | ${distance.toFixed(4).padStart(12)} | ${duration.toFixed(3).padStart(12)} | ${deltaDist.toFixed(4).padStart(10)} | ${deltaPercent.toFixed(2).padStart(6)}%`
+        )
+      }
+    }
+
+    console.log("-".repeat(80))
+    console.log(`Total range: ${results[0].distance.toFixed(4)}m to ${results[results.length - 1].distance.toFixed(4)}m`)
+    console.log("=".repeat(80) + "\n")
+
+    expect(results.length).to.equal(offsetXValues.length)
+  })
+})
