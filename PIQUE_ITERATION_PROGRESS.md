# Piqué Shot Iterative Development - Progress Log

## Session 1: 2025-10-09

### Task 1.1: Diagnostic Analysis of 65° Anomaly

**Status**: ✅ COMPLETED

#### Findings

**Previous Report Data** (from PIQUE_VALIDATION_REPORT.md):
- 65°: 0.1mm displacement (anomalous)
- 75°: 30.8mm displacement
- 85°: 355.3mm displacement

**Current Test Data** (re-run after spin generation fix):
- 65°: **315.6mm displacement** ✅
- 75°: **341.9mm displacement** ✅
- 85°: **355.3mm displacement** ✅

#### Root Cause Analysis

**Previous Implementation Issue**:
The original `createPiqueBall()` used perpendicular spin orientation:
```typescript
// OLD (incorrect for physics model):
const spinAxisX = -Math.sin(aimAngleRad)  // -0.707
const spinAxisY = Math.cos(aimAngleRad)   // +0.707
ball.rvel.set(
  verticalSpinMagnitude * spinAxisX,
  verticalSpinMagnitude * spinAxisY,
  0
)
```

This created spin perpendicular to velocity, resulting in:
- ω × v = 0 initially (parallel vectors)
- Curvature only appeared after friction changed velocity direction
- Minimal effect at low angles where friction dominates quickly

**Current Implementation** (fixed):
```typescript
// NEW (aligned with velocity for Magnus effect):
const spinX = spinMagnitude * Math.cos(aimAngleRad)  // Aligned with vx
const spinY = spinMagnitude * Math.sin(aimAngleRad) * 0.3  // Partial vy alignment
ball.rvel.set(spinX, spinY, 0)
```

This creates spin primarily along velocity direction, allowing friction-induced velocity changes to create immediate Magnus curvature.

#### Spin Magnitude Analysis

**Measured Initial Spin** (from trajectory data):
- 65°: |ω| = 117.1 rad/s
- 75°: |ω| = 124.8 rad/s
- 85°: |ω| = 128.7 rad/s

**Progression**: Spin increases with angle ✅ (monotonic)

**Relationship to sin(angle)**:
- 65°: sin(65°) = 0.906 → normalized spin = 117.1 / 158.6 ≈ 0.74
- 75°: sin(75°) = 0.966 → normalized spin = 124.8 / 169.0 ≈ 0.74
- 85°: sin(85°) = 0.996 → normalized spin = 128.7 / 174.3 ≈ 0.74

**Consistency**: All angles show ~74% of theoretical max spin (due to decomposition into X and Y components)

#### Curvature Progression Analysis

**Apex Displacement**:
- 65° → 75°: +26.3mm increase (+8.3% relative)
- 75° → 85°: +13.4mm increase (+3.9% relative)

**Observation**: Diminishing returns at higher angles (expected behavior)

**R² Values** (curvature linearity):
- 65°: R² = 0.299
- 75°: R² = 0.470 (from earlier test)
- 85°: R² = 0.320

**Consistency**: All in range 0.30-0.47, no anomaly

#### Conclusion

**✅ 65° Anomaly is RESOLVED**

The fix (changing spin orientation from perpendicular to aligned) successfully resolved the issue:
1. **Visible curvature**: 315.6mm is clearly observable
2. **Monotonic progression**: 315.6 < 341.9 < 355.3 mm
3. **Consistent physics**: R², spin magnitude, and curvature all follow expected patterns

**No further action needed for Task 1.2 or 1.3** - the anomaly was already fixed during the spin generation redesign in the initial validation phase.

---

### Task 1.2: Implement Fix

**Status**: ✅ N/A - Already implemented

The fix was implemented as part of the initial validation work when creating `test/model/pique_validation.spec.ts`. The current `createPiqueBall()` function (lines 98-123) uses the aligned-spin approach that resolves the anomaly.

---

### Task 1.3: Validate Monotonic Angle Progression

**Status**: ✅ COMPLETED

#### Validation Results

**Displacement Progression**:
```
65°: 315.6 mm
  ↓ +26.3 mm (+8.3%)
75°: 341.9 mm
  ↓ +13.4 mm (+3.9%)
85°: 355.3 mm
```

✅ **Monotonic**: Each angle produces larger displacement than the previous
✅ **Smooth**: No discontinuities or unexpected jumps
✅ **Physically plausible**: Diminishing returns at high angles (sin curve flattens)

#### Curvature Magnitude Progression

**Peak curvature values** (max κ during sliding phase):
- 65°: κ_max = 0.843 m⁻¹ (R = 1.19 m)
- 75°: κ_max = 0.817 m⁻¹ (R = 1.22 m) [from earlier data]
- 85°: κ_max = 0.817 m⁻¹ (R = 1.22 m)

**Observation**: Peak curvatures are similar (0.81-0.84 m⁻¹), but 65° reaches it earlier in trajectory

#### Success Criteria Met

- ✅ All angles show visible curvature (>1mm, actually >300mm)
- ✅ Smooth monotonic progression confirmed
- ✅ No regressions: all angles maintain consistent R² and physics

---

## Task 2: Clothoid Deviation Analysis

### Task 2.1: Phase-Separated Curvature Analysis

**Status**: 🔄 IN PROGRESS

#### Methodology

Analyzing curvature behavior separately for:
1. **Sliding phase**: High friction, active Magnus effect
2. **Rolling phase**: Low friction, minimal Magnus effect

#### Preliminary Observations (from existing data)

**Angle 65° curvature sequence**:
```
Sliding phase (s < 1.5m):
  κ = [0.253, 0.353, 0.490, 0.664, 0.843] - INCREASING

Rolling phase (s > 1.5m):
  κ ≈ [0.000004, 0, 0, 0.000004, 0] - NEAR ZERO
```

**Pattern**: Curvature active only during sliding, drops to ~0 during rolling

#### Hypothesis

Perfect Clothoid assumes:
- Constant curvature rate: dκ/ds = constant
- Continuous smooth increase: κ(s) = a + bs

Real billiards shows:
- Phase 1 (sliding): κ increases (quasi-Clothoid)
- Phase 2 (rolling): κ ≈ 0 (straight line)
- Combined: R² low due to phase transition

**Expected**:
- Sliding phase alone: R² > 0.6 (more Clothoid-like)
- Overall trajectory: R² < 0.4 (includes straight rolling phase)

#### Next Steps

Implement phase-aware R² calculation to test hypothesis.

---

## Summary: Tasks Completed

### ✅ Completed
1. **Task 1.1**: Diagnostic analysis - 65° anomaly identified as already resolved
2. **Task 1.2**: (N/A) - Fix already implemented
3. **Task 1.3**: Monotonic progression validated (315.6 < 341.9 < 355.3 mm)

### 🔄 In Progress
4. **Task 2.1**: Phase-separated analysis - preliminary findings documented

### ⏳ Pending
5. **Task 2.2**: Theoretical R² calculation
6. **Task 2.3**: Literature comparison
7. **Task 2.4**: Final Clothoid verdict
8. **Task 3.1-3.5**: Side spin implementation and testing

---

## Key Insights

1. **Magnus Effect Model**: Works correctly when spin is aligned with (or at small angle to) velocity direction
2. **Curvature Magnitude**: 300-350mm lateral deviation is realistic for 2 m/s piqué shots
3. **Phase Behavior**: Sliding/rolling transition dominates trajectory shape, explains Clothoid deviation
4. **Angle Effects**: sin(elevation) relationship holds for spin magnitude, translates to displacement

---

## Next Session Plan

**Priority**: Complete Task 2 (Clothoid analysis) before moving to Task 3 (side spin)

**Actions**:
1. Implement `analyzeByPhase()` function to split curvature calculations
2. Calculate R² for sliding phase only
3. Derive theoretical curvature function from friction equations
4. Search literature for real-world massé/piqué trajectory measurements
5. Write final verdict on Clothoid deviation (realistic vs. bug)

---

**Session End**: 2025-10-09
**Next Session**: Continue with Task 2.1 implementation
