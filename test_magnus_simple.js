const { Vector3 } = require('three');

// Test cross product
function testCross(v, w) {
  const result = new Vector3().copy(w).cross(v);
  console.log(`v=${v.toArray()}, w=${w.toArray()}`);
  console.log(`  ω × v = ${result.toArray()}`);
  const filtered = new Vector3(result.x, result.y, 0);
  console.log(`  After setZ(0) = ${filtered.toArray()}`);
  console.log('');
}

// Test 1: Parallel vectors (both in X)
testCross(new Vector3(2, 0, 0), new Vector3(10, 0, 0));

// Test 2: Perpendicular in XY plane
testCross(new Vector3(2, 0, 0), new Vector3(0, 10, 0));

// Test 3: 45° velocity, perpendicular spin in XY
testCross(new Vector3(1.414, 1.414, 0), new Vector3(-10, 10, 0));

// Test 4: 45° velocity, Y-axis spin
testCross(new Vector3(1.414, 1.414, 0), new Vector3(0, 10, 0));

// Test 5: X velocity, Y-axis spin
testCross(new Vector3(2, 0, 0), new Vector3(0, 10, 0));
