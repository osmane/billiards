# Piqué Shot Physical Accuracy Validation Plan

## Overview
This document outlines the testing and validation strategy for verifying the physical accuracy of the piqué shot implementation. The trajectory follows a Clothoid Spiral (Euler's Spiral) pattern, and validation will be based on quantitative numerical analysis of trajectory data.

## Theoretical Foundation
**Clothoid Spiral (Euler's Spiral)**: A curve whose curvature increases linearly with arc length. For piqué shots, the ball's trajectory exhibits this property due to the Magnus effect combined with spin decay from friction.

**Key Mathematical Property**:
- Radius of curvature R(s) should vary approximately as: R(s) = k/(a + bs) where s is arc length, and a, b are constants dependent on initial conditions

## Test Methodology

### Phase 1: Parametric Cue Angle Analysis
**Objective**: Analyze how cue elevation angle affects trajectory shape while holding other variables constant.

**Test Parameters**:
- Cue angles: 85°, 75°, 65° (steep angles characteristic of piqué shots)
- Constant initial velocity: 2.0 m/s
- Constant strike offset: (0, 0) - center strike
- Constant friction coefficient: default (μ_s = 0.16)
- Simulation duration: 2.0 seconds per test

**Data Collection**:
For each test case, log trajectory coordinates at 0.01s intervals:
- Position (x, y, z)
- Velocity (vx, vy, vz)
- Angular velocity (ωx, ωy, ωz)
- Timestamp

**Quantitative Analysis**:
1. **Curvature Analysis**:
   - Calculate radius of curvature at 10 evenly-spaced points along trajectory
   - Method: R(s) = ((dx/ds)² + (dy/ds)²)^(3/2) / |dx/ds·d²y/ds² - dy/ds·d²x/ds²|
   - Verify near-linear relationship between curvature (κ = 1/R) and arc length
   - Statistical measure: R² correlation coefficient for κ vs s (target: R² > 0.85)

2. **Trajectory Metrics**:
   - Total arc length during sliding phase
   - Apex coordinates (maximum lateral displacement)
   - Transition point coordinates (sliding → rolling)
   - Final resting position
   - Curvature rate: dκ/ds (should be approximately constant)

### Phase 2: Cue Force Impact Analysis
**Objective**: Examine how initial force magnitude affects the Clothoid characteristics.

**Test Parameters**:
- Constant cue angle: 75°
- Varying initial velocities: 1.5 m/s, 2.0 m/s, 2.5 m/s
- Constant strike offset: (0, 0)
- Constant friction coefficient: default

**Data Collection**: Same as Phase 1

**Quantitative Analysis**:
1. **Force-Trajectory Relationship**:
   - Compare arc length vs initial force
   - Compare apex displacement vs initial force
   - Compare transition point distance vs initial force

2. **Clothoid Parameter Scaling**:
   - Extract Clothoid parameters (a, b) for each force level
   - Verify scaling relationships with initial energy

### Phase 3: Friction Coefficient Analysis
**Objective**: Document the numerical impact of friction on trajectory characteristics.

**Test Parameters**:
- Constant cue angle: 75°
- Constant initial velocity: 2.0 m/s
- Friction coefficient: default value (documented in test output)

**Data Collection**: Same as Phase 1

**Quantitative Analysis**:
1. **Friction Impact Metrics**:
   - Sliding phase duration (time until rolling)
   - Arc length during sliding phase
   - Spin decay rate: dω/dt during sliding
   - Energy dissipation rate

2. **Trajectory Shape Analysis**:
   - Curvature progression during sliding phase
   - Straightening behavior after rolling transition
   - Final displacement from straight-line path

## Success Criteria

### Primary Validation Metrics
1. **Clothoid Conformance**: R² > 0.85 for curvature vs arc length linear fit
2. **Consistent Curvature Rate**: dκ/ds standard deviation < 20% of mean across angles
3. **Physical Plausibility**: All trajectories remain on table surface (z-velocity = 0)
4. **Monotonic Progression**: Higher cue angles produce tighter curves (smaller R at equivalent arc lengths)

### Comparative Metrics (Angle Variation)
| Angle | Expected Apex Displacement | Expected Arc Length | Expected Transition Distance |
|-------|---------------------------|---------------------|------------------------------|
| 65°   | Smallest                  | Longest             | Farthest                     |
| 75°   | Medium                    | Medium              | Medium                       |
| 85°   | Largest                   | Shortest            | Nearest                      |

### Data Quality Requirements
- Minimum 100 data points per trajectory
- Temporal resolution: ≤ 0.01s
- Spatial precision: ≤ 0.001m

## Documentation Requirements

### Test Execution Report
For each test case, document:
- Input parameters (angle, force, friction)
- Raw coordinate logs (CSV format)
- Calculated metrics table
- Curvature analysis results
- Statistical measures (R², mean, std dev)

### Final Validation Report
Include:
- Executive summary (pass/fail verdict)
- Comparative data tables across all test cases
- Curvature analysis plots (numerical summaries if plots unavailable)
- Clothoid conformance assessment
- Discussion of deviations from theoretical model
- Conclusion on physical accuracy

## Test Execution Workflow

1. **Setup Phase**:
   - Create test execution script
   - Configure logging infrastructure
   - Verify test framework integration

2. **Execution Phase**:
   - Run Phase 1 tests (3 angle variations)
   - Run Phase 2 tests (3 force variations)
   - Run Phase 3 test (friction analysis)
   - Log all trajectory data to files

3. **Analysis Phase**:
   - Load trajectory data
   - Calculate curvature at sample points
   - Perform statistical analysis
   - Generate metrics tables

4. **Documentation Phase**:
   - Compile all numerical results
   - Write analysis interpretation
   - Generate final validation report
   - Integrate with developer documentation system

## Implementation Notes

**Test File Location**: `test/model/pique_validation.spec.ts`

**Data Output Location**: `test/data/pique_trajectories/`

**Coordinate Logging Format**:
```
time,x,y,z,vx,vy,vz,wx,wy,wz
0.00,0.0000,0.0000,0.0000,1.414,1.414,0.000,15.2,-10.8,0.0
0.01,0.0141,0.0141,0.0000,1.410,1.418,0.000,14.9,-10.6,0.0
...
```

**Analysis Script**: Post-processing script for curvature calculation and statistical analysis

## Expected Timeline
- Test plan creation: Complete
- Test implementation: ~1-2 hours
- Test execution: ~15 minutes
- Data analysis: ~1-2 hours
- Documentation: ~1-2 hours
- **Total**: ~4-6 hours

## References
- Clothoid Spiral mathematics: Standard differential geometry textbooks
- Magnus effect physics: Existing `masse_development_plan.txt`
- Friction models: `src/model/physics/physics.ts`
- Test framework: `test/model/masse.spec.ts` (existing)
