// The default values ​​here should be based on carom (3 cushion) mode.
export const g = 9.8
export let mu = 0.00985
export let muS = 0.16
export let muC = 0.85
export let rho = 0.04
export let e = 0.86

// Mathaven specific
// Coefficient of restitution
export let ee = 0.97

// Coefficient of sliding friction (table)
export let μs = 0.212

// Coefficient of sliding friction (cushion)
export let μw = 0.12

// Magnus effect coefficient (for massé shots)
// Adjusted for 2D billiards physics - much lower than 3D aerodynamic coefficient
// Original Han model value (0.065) was too strong for our implementation
// This coefficient is empirically tuned for gentle, realistic curves
export let magnusCoeff = 0.001  // Calibrated within doc range (1e-4..1e-3)

// Table bounce restitution coefficient (felt dampening)
// Typical values: 0.3-0.5 for cloth-covered table
export let tableRestitution = 0.3  // Lower = less bounce height

// Magnus effect multipliers for different states
export let magnusAirborneMultiplier = 1.2  // Reduced for realistic airborne physics
export let magnusTableMultiplier = 0.3     // On-table magnus strength

// Air drag parameters (for airborne motion)
// Air density at sea level (kg/m³)
export let airDensity = 1.2

// Drag coefficient for a sphere (dimensionless)
// Typical values: 0.4-0.5 for smooth sphere at low Re
export let dragCoefficient = 0.47

// Air drag damping for horizontal velocity (per second)
// Higher values = more air resistance
export let airDragDamping = 0.15  // Calibrated for realistic deceleration

export let Mz: number
export let Mxy: number
export let I: number

// Fixed angle of cushion contact point above ball center
export const sinθ = 2 / 5
// Fixed angle of cushion contact point above ball center
export const cosθ = Math.sqrt(21) / 5

export let airborneThresholdFactor = 0.06

// Scale for vertical velocity imparted by elevated cue hits.
// < 1 reduces jump height; the remaining energy is redirected to horizontal
// via re-normalization in applyShotFromPose.
// Neutralize elevation vertical impulse scaling (keep physics-based impulse)
export let elevationVerticalImpulseScale = 1.0

export function setAirborneThresholdFactor(val: number) {
  airborneThresholdFactor = val
}

export function setElevationVerticalImpulseScale(val: number) {
  elevationVerticalImpulseScale = val
}

// Top-hit dependent jump gain (directional only)
// Positive when hitting near the top of the ball (hitDir.z > 0), negative near bottom.
// Scaled by elevation to reflect that elevation dominates jumping.
// Neutralize top-hit directional gain (non-physical modulation removed)
export let topHitJumpDirectionalGain = 0.0
export let topHitJumpElevationRef = 0.30     // radians; |elevation|/ref is clamped to [0,1]

export function setTopHitJumpDirectionalGain(val: number) {
  topHitJumpDirectionalGain = val
}
export function setTopHitJumpElevationRef(val: number) {
  topHitJumpElevationRef = Math.max(1e-6, val)
}

// Spin-to-direction coupling tuning for strong shots
// Reduces the influence of spin on movement direction at high speeds
// without altering total deceleration magnitude (we only rotate direction).
// Keep spin-direction coupling unscaled (physics handles via slip/roll)
export let spinDirCouplingStrongScale = 1.0
export let spinDirStrongSpeed = 3.0          // m/s, full reduction above this speed
export let spinDirWeakSpeed = 1.5            // m/s, no reduction below this speed

export function setSpinDirCouplingStrongScale(val: number) {
  spinDirCouplingStrongScale = Math.max(0, Math.min(1, val))
}
export function setSpinDirStrongSpeed(val: number) {
  spinDirStrongSpeed = Math.max(0, val)
}
export function setSpinDirWeakSpeed(val: number) {
  spinDirWeakSpeed = Math.max(0, Math.min(spinDirStrongSpeed, val))
}

export const CAROM_TABLE_LENGTH = 2.84;     // Oynanabilir alan (banttan banta) uzunluk
export const CAROM_TABLE_WIDTH = 1.42;     // Oynanabilir alan (banttan banta) genişlik
export const CAROM_BALL_DIAMETER = 0.0615;   // 61.5 mm

export let BALL_MASS = 0.165; // kg

export const POOL_BALL_RADIUS = 0.05715 / 2;   // 57.15 mm (2 1/4")
export const SNOOKER_BALL_RADIUS = 0.0525 / 2; // 52.5 mm (2 1/16")
export const CAROM_BALL_RADIUS = 0.0615 / 2;   // 61.5 mm

// (yeni) Kütleler (kg) — tipik aralıklar; gerekirse kalibre et:
export const POOL_BALL_MASS = 0.17;     // 0.165–0.17 kg yaygın
export const SNOOKER_BALL_MASS = 0.142; // ~142 g
export const CAROM_BALL_MASS = 0.21;    // 0.205–0.215 kg

// Physics Context Interface for mode-specific physics isolation
export interface PhysicsContext {
  R: number;  // Ball radius
  m: number;  // Ball mass
  mu?: number; // Rolling friction coefficient override
  rho?: number; // Spin decay distribution coefficient override
  muS?: number; // Sliding friction coefficient override
  spinStopThreshold?: number; // Threshold for zero-spin detection
  rollingTransition?: number; // Rolling transition threshold (m/s)
  // Collision resolution parameters (Codex 2025-10-21)
  collisionSeparationBias?: number; // Extra separation after collision (default: 0.01)
  minSeparationSpeed?: number; // Minimum separation velocity (default: 0.004 m/s)
  collisionVelocityEpsilon?: number; // Minimum approach speed to trigger collision (default: 0.002 m/s)
}

// Mode-specific physics contexts
export const POOL_PHYSICS: PhysicsContext = {
  R: POOL_BALL_RADIUS,
  m: POOL_BALL_MASS
};

export const SNOOKER_PHYSICS: PhysicsContext = {
  R: SNOOKER_BALL_RADIUS,
  m: SNOOKER_BALL_MASS
};

export const CAROM_PHYSICS: PhysicsContext = {
  R: CAROM_BALL_RADIUS,  // 0.03075 m (61.5mm radius)
  m: CAROM_BALL_MASS,     // 0.21 kg
  mu: 0.0063,             // Rolling friction - Calibrated for 12.5m at max power
  rho: 0.09,              // Spin decay coefficient (unchanged)
  muS: 0.09,             // Sliding friction - Calibrated for 12.5m at max power
  spinStopThreshold: 0.05,
  rollingTransition: 0.10
};

// Global parameters (legacy - maintained for backward compatibility)
export let R = POOL_BALL_RADIUS;
export let m = POOL_BALL_MASS;

export function setR(radius: number) {
  R = radius;
  refresh?.();
}

refresh()

function refresh() {
  Mz = ((mu * m * g * 2) / 3) * rho
  Mxy = (7 / (5 * Math.sqrt(2))) * R * mu * m * g
  I = (2 / 5) * m * R * R
}

// Physics context-aware refresh functions
export function refreshWithContext(physics: PhysicsContext): { Mz: number, Mxy: number, I: number } {
  const effectiveMu = physics.mu ?? mu
  const effectiveRho = physics.rho ?? rho
  const Mz_ctx = ((effectiveMu * physics.m * g * 2) / 3) * effectiveRho
  const Mxy_ctx = (7 / (5 * Math.sqrt(2))) * physics.R * effectiveMu * physics.m * g
  const I_ctx = (2 / 5) * physics.m * physics.R * physics.R

  return { Mz: Mz_ctx, Mxy: Mxy_ctx, I: I_ctx }
}

// Helper function to get physics context by game mode
export function getPhysicsContext(gameMode: string): PhysicsContext {
  switch (gameMode) {
    case "threecushion":
      return CAROM_PHYSICS;
    case "snooker":
      return SNOOKER_PHYSICS;
    case "nineball":
    case "fourteenone":
    default:
      return POOL_PHYSICS;
  }
}

export function setm(val: number) {
  m = val;
  refresh?.();
}
export function setmu(val: number) {
  mu = val
  refresh()
}
export function setrho(val: number) {
  rho = val
  refresh()
}
export function setmuS(val: number) {
  muS = val
}
export function sete(val: number) {
  e = val
}
export function setmuC(val: number) {
  muC = val
}
export function setμs(val: number) {
  μs = val
}
export function setμw(val: number) {
  μw = val
}
export function setee(val: number) {
  ee = val
}
export function setMagnusCoeff(val: number) {
  magnusCoeff = val
}
export function setTableRestitution(val: number) {
  tableRestitution = val
}
export function setMagnusAirborneMultiplier(val: number) {
  magnusAirborneMultiplier = val
}
export function setMagnusTableMultiplier(val: number) {
  magnusTableMultiplier = val
}
export function setAirDensity(val: number) {
  airDensity = val
}
export function setDragCoefficient(val: number) {
  dragCoefficient = val
}
export function setAirDragDamping(val: number) {
  airDragDamping = val
}
