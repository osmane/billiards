/**
 * Spin Calculation Comparison Test
 *
 * Compares spin directions between:
 * 1. Spin Guide 3D method (simple physics: ΔL = r × p)
 * 2. Billiards cueToSpinUniversal method
 *
 * Generates 180 test cases with various elevation angles and hit offsets.
 */

import { Vector3 } from 'three';
import { cueToSpinUniversal } from '../src/model/physics/physics';

// Ball parameters
const BALL_RADIUS = 0.028575; // meters (standard billiard ball)

/**
 * Spin Guide 3D method (reference implementation)
 * Simple physics: ΔL = r × p, then ω = ΔL / I
 */
function spinGuideMethod(hitPoint: Vector3, ballCenter: Vector3, velocity: Vector3): Vector3 {
  // Direction from ball center to hit point
  const n = new Vector3().subVectors(hitPoint, ballCenter).normalize();

  // Contact lever arm (radius vector to surface)
  const rVec = n.clone().multiplyScalar(BALL_RADIUS);

  // Linear momentum (mass cancels out in final calculation)
  const linearMomentum = velocity.clone(); // mass = 1 for comparison

  // Angular momentum: ΔL = r × p
  const deltaL = new Vector3().crossVectors(rVec, linearMomentum);

  // For solid sphere: I = (2/5)MR², so ω = L / I = L * (5/2MR²)
  const I = (2.0 / 5.0) * BALL_RADIUS * BALL_RADIUS; // mass = 1
  const omega = deltaL.multiplyScalar(1.0 / I);

  return omega;
}

/**
 * Generate test cases: 180 different shots
 * - Various elevation angles (0° to 85°)
 * - Various azimuth angles (0° to 360°)
 * - Hit offsets near ball edge (0.7 to 0.9 normalized)
 */
function generateTestCases(): Array<{
  elevation: number;
  azimuth: number;
  offset: { x: number; y: number };
  velocity: Vector3;
  hitPoint: Vector3;
}> {
  const cases: Array<{
    elevation: number;
    azimuth: number;
    offset: { x: number; y: number };
    velocity: Vector3;
    hitPoint: Vector3;
  }> = [];
  const ballCenter = new Vector3(0, 0, 0);

  // 6 elevation angles × 6 azimuth angles × 5 offset patterns = 180 cases
  const elevations = [0, 15, 30, 45, 60, 75]; // degrees
  const azimuths = [0, 60, 120, 180, 240, 300]; // degrees
  const offsets = [
    { x: 0.8, y: 0.0 },   // Right edge
    { x: 0.0, y: 0.8 },   // Top edge
    { x: -0.7, y: 0.0 },  // Left edge
    { x: 0.0, y: -0.7 },  // Bottom edge
    { x: 0.6, y: 0.6 },   // Top-right diagonal
  ];

  for (const elevDeg of elevations) {
    for (const azimDeg of azimuths) {
      for (const offset of offsets) {
        const elevRad = (elevDeg * Math.PI) / 180;
        const azimRad = (azimDeg * Math.PI) / 180;

        // Velocity direction based on elevation and azimuth
        const speed = 2.0; // m/s
        const horizontalSpeed = speed * Math.cos(elevRad);
        const verticalSpeed = speed * Math.sin(elevRad);

        const velocity = new Vector3(
          horizontalSpeed * Math.cos(azimRad),
          horizontalSpeed * Math.sin(azimRad),
          verticalSpeed
        );

        // Hit point calculation (simplified - using canvas offset mapping)
        // Map offset to 3D point on ball surface
        // For now, use simple sphere parametrization
        const theta = Math.asin(offset.y); // Vertical angle
        const phi = Math.asin(offset.x / Math.cos(theta)); // Horizontal angle

        const hitPoint = new Vector3(
          BALL_RADIUS * Math.cos(theta) * Math.sin(phi),
          BALL_RADIUS * Math.cos(theta) * Math.cos(phi),
          BALL_RADIUS * Math.sin(theta)
        ).add(ballCenter);

        cases.push({
          elevation: elevDeg,
          azimuth: azimDeg,
          offset,
          velocity,
          hitPoint,
        });
      }
    }
  }

  return cases;
}

/**
 * Compare spin directions
 */
function compareSpins(omega1: Vector3, omega2: Vector3): {
  dotProduct: number;
  angleDeg: number;
  sameDirection: boolean;
} {
  const mag1 = omega1.length();
  const mag2 = omega2.length();

  if (mag1 < 1e-6 || mag2 < 1e-6) {
    return { dotProduct: 0, angleDeg: 0, sameDirection: true };
  }

  const normalized1 = omega1.clone().normalize();
  const normalized2 = omega2.clone().normalize();

  const dot = normalized1.dot(normalized2);
  const angleDeg = (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;

  // Same direction if angle < 10 degrees
  const sameDirection = angleDeg < 10;

  return { dotProduct: dot, angleDeg, sameDirection };
}

/**
 * Run the comparison test
 */
function runComparisonTest() {
  console.log('='.repeat(80));
  console.log('SPIN CALCULATION COMPARISON TEST');
  console.log('='.repeat(80));
  console.log('');

  const testCases = generateTestCases();
  console.log(`Generated ${testCases.length} test cases`);
  console.log('');

  const ballCenter = new Vector3(0, 0, 0);
  let matchCount = 0;
  let mismatchCount = 0;
  const mismatches: Array<{
    caseNum: number;
    elevation: number;
    azimuth: number;
    offset: { x: number; y: number };
    omega1: Vector3;
    omega2: Vector3;
    angleDeg: number;
  }> = [];

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];

    // Method 1: Spin Guide
    const omega1 = spinGuideMethod(tc.hitPoint, ballCenter, tc.velocity);

    // Method 2: Billiards cueToSpinUniversal
    const omega2 = cueToSpinUniversal(tc.hitPoint, ballCenter, tc.velocity);

    // Compare
    const comparison = compareSpins(omega1, omega2);

    if (comparison.sameDirection) {
      matchCount++;
    } else {
      mismatchCount++;
      mismatches.push({
        caseNum: i + 1,
        elevation: tc.elevation,
        azimuth: tc.azimuth,
        offset: tc.offset,
        omega1,
        omega2,
        angleDeg: comparison.angleDeg,
      });
    }
  }

  console.log('='.repeat(80));
  console.log('RESULTS');
  console.log('='.repeat(80));
  console.log(`Total cases: ${testCases.length}`);
  console.log(`Matches (same direction): ${matchCount} (${((matchCount / testCases.length) * 100).toFixed(1)}%)`);
  console.log(`Mismatches (different direction): ${mismatchCount} (${((mismatchCount / testCases.length) * 100).toFixed(1)}%)`);
  console.log('');

  if (mismatchCount > 0) {
    console.log('='.repeat(80));
    console.log('MISMATCHES (First 10)');
    console.log('='.repeat(80));

    for (let i = 0; i < Math.min(10, mismatches.length); i++) {
      const m = mismatches[i];
      console.log(`Case ${m.caseNum}: Elevation=${m.elevation}°, Azimuth=${m.azimuth}°, Offset=(${m.offset.x.toFixed(2)}, ${m.offset.y.toFixed(2)})`);
      console.log(`  Spin Guide: (${m.omega1.x.toFixed(2)}, ${m.omega1.y.toFixed(2)}, ${m.omega1.z.toFixed(2)})`);
      console.log(`  Billiards:  (${m.omega2.x.toFixed(2)}, ${m.omega2.y.toFixed(2)}, ${m.omega2.z.toFixed(2)})`);
      console.log(`  Angle difference: ${m.angleDeg.toFixed(1)}°`);
      console.log('');
    }
  } else {
    console.log('✅ ALL TESTS PASSED! Spin directions match perfectly.');
  }
}

// Run the test
runComparisonTest();
