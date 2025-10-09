# Developer Documentation Index

## Purpose
This document provides a quick reference for AI assistants and developers to navigate the billiards project documentation, particularly related to advanced shot physics (massé and piqué).

---

## Document Categories

### 1. Implementation Summaries (Human-Readable)

#### Massé Shot Implementation
- **MASSE_COMPLETE.md**: ✅ Completion checklist and overview
  - Status: 100% complete, production-ready
  - Key info: Test results (31/31 passing), modified files, success criteria
  - Use case: Quick verification that massé is fully implemented

- **MASSE_IMPLEMENTATION_SUMMARY.md**: 📋 Technical implementation details
  - Magnus force physics formulas
  - Code snippets with line numbers
  - Integration points in codebase
  - Use case: Understanding how massé physics works

- **MASSE_USER_GUIDE.md**: 🎮 Player-facing instructions
  - Controls (PageUp/PageDown for elevation)
  - Tips for executing shots
  - Physics explanation (simplified)
  - Use case: Helping users learn massé technique

### 2. Development Process Documents (AI-Friendly)

#### Massé Development
- **masse_development_plan.txt**: 📝 11-phase implementation roadmap
  - Test-Driven Development (TDD) structure
  - Phase-by-phase breakdown with success criteria
  - "What Not To Do" sections for avoiding past mistakes
  - Resume points for continuing work across sessions
  - Use case: Planning similar features or understanding development approach

- **masse_progress_log.txt**: 📊 Detailed session-by-session progress
  - Phase completion status
  - Test results at each stage
  - Code findings and architectural insights
  - Blockers encountered and resolved
  - Use case: Understanding development history and debugging

#### Piqué Validation
- **PIQUE_VALIDATION_PLAN.md**: 🧪 Test plan for physical accuracy validation
  - Clothoid Spiral theoretical foundation
  - 3-phase parametric testing methodology
  - Data collection specifications
  - Success criteria (quantitative metrics)
  - Use case: Designing validation tests for physics simulations

- **PIQUE_VALIDATION_REPORT.md**: 📈 Quantitative analysis results
  - Test results with statistical data
  - Trajectory metrics (arc length, displacement, curvature)
  - Comparison with theoretical Clothoid model
  - Assessment of physical accuracy
  - Use case: Verifying physics implementation quality

- **test/model/pique_validation.spec.ts**: 💻 Executable validation tests
  - Parametric test cases (angle/force variations)
  - Curvature analysis algorithms
  - Trajectory data logging (CSV output)
  - Use case: Running validation tests, extending test coverage

---

## Quick Reference by Task

### "I need to understand massé shot physics"
→ Read: `MASSE_IMPLEMENTATION_SUMMARY.md` (sections: Magnus Force Physics, Cue Elevation to Spin)

### "I need to add a new shot type"
→ Read: `masse_development_plan.txt` (phases 1-11 provide reusable TDD template)

### "User reports massé shots don't curve"
→ Check: `MASSE_COMPLETE.md` (test results), then `src/model/physics/physics.ts:286` (magnus function)

### "I need to validate trajectory accuracy"
→ Read: `PIQUE_VALIDATION_PLAN.md`, then run `npm test -- test/model/pique_validation.spec.ts`

### "I need quantitative physics data"
→ Read: `PIQUE_VALIDATION_REPORT.md` (Phase 1-3 results tables)

### "I want to see raw trajectory data"
→ Look in: `test/data/pique_trajectories/*.csv` and `*_metrics.json`

---

## Code Reference Quick Links

### Physics Implementation
| Component | File | Lines | Description |
|-----------|------|-------|-------------|
| Magnus force | `src/model/physics/physics.ts` | 286-310 | F = k × (ω × v), horizontal-only |
| Magnus coefficient | `src/model/physics/constants.ts` | - | k_magnus = 2.0 |
| Force integration | `src/model/ball.ts` | 75-90 | Applies Magnus in updateVelocity() |
| Cue elevation control | `src/view/cue.ts` | 112-120 | adjustElevation() and setElevation() |
| Elevation to spin | `src/view/cue.ts` | 66-81 | Converts angle to vertical spin |
| Elevation event | `src/events/aimevent.ts` | - | AimEvent.elevation property |

### UI Components
| Component | File | Purpose |
|-----------|------|---------|
| Elevation display | `src/view/aiminputs.ts` | Shows current angle (0-90°) |
| Visual indicator | `index.html` | Bottom-right elevation text |
| Keyboard handlers | `src/controller/controllerbase.ts` | PageUp/PageDown events |

### Testing
| Component | File | Tests |
|-----------|------|-------|
| Massé physics | `test/model/masse.spec.ts` | 31 comprehensive tests |
| Piqué validation | `test/model/pique_validation.spec.ts` | 15 parametric tests |
| Jest config | `test/jest.config.js` | TypeScript + SWC setup |

---

## Document Format Guidelines

### For Human-Readable Docs (.md)
- ✅ Use emoji sparingly for status indicators (✅ ❌ ⚠️ 🎮 📋)
- ✅ Include tables for structured data
- ✅ Use code blocks with language tags (```typescript)
- ✅ Provide file paths with line numbers (src/file.ts:123)
- ✅ Use hierarchical headers (##, ###)

### For AI-Friendly Development Docs (.txt, .md)
- ✅ Include "STOPPED AT" / "NEXT ACTION" resume points
- ✅ Document failures in "WHAT NOT TO DO" sections
- ✅ Provide phase-by-phase breakdowns with completion checkboxes
- ✅ Use consistent formatting (e.g., `PHASE N: NAME` pattern)
- ✅ Include both high-level overview AND implementation details

### For Validation Reports (.md)
- ✅ Lead with Executive Summary (verdict + key findings)
- ✅ Include quantitative data in tables
- ✅ Provide raw data file references
- ✅ Compare actual vs expected results
- ✅ Explain deviations with physics reasoning

---

## Data File Locations

### Test Output Data
```
test/data/pique_trajectories/
├── angle_65_trajectory.csv     # Raw (time, x, y, z, vx, vy, vz, wx, wy, wz)
├── angle_65_metrics.json       # Computed (arc length, curvature, R²)
├── angle_75_trajectory.csv
├── angle_75_metrics.json
├── angle_85_trajectory.csv
├── angle_85_metrics.json
├── force_low_trajectory.csv
├── force_low_metrics.json
├── force_med_trajectory.csv
├── force_med_metrics.json
├── force_high_trajectory.csv
├── force_high_metrics.json
├── friction_analysis_trajectory.csv
└── friction_analysis_metrics.json
```

### Trajectory CSV Format
```csv
time,x,y,z,vx,vy,vz,wx,wy,wz
0.0000,0.000000,0.000000,0.000000,1.414214,1.414214,0.000000,87.097,26.129,0.000000
0.0100,0.014137,0.014047,0.000000,1.412754,1.395865,0.000000,85.728,26.228,0.000000
...
```

### Metrics JSON Structure
```json
{
  "testCase": { "name": "...", "angle": 85, "velocity": 2.0 },
  "metrics": {
    "totalArcLength": 2.822,
    "apexDisplacement": 0.355,
    "curvatureAnalysis": {
      "linearityR2": 0.32,
      "curvatures": [0.261, 0.360, ...],
      "arcLengths": [0.020, 0.359, ...]
    }
  }
}
```

---

## Glossary

**Massé**: Advanced billiards technique using elevated cue to create curved trajectory
**Piqué**: Similar to massé, typically refers to steeper angles (85-90°)
**Magnus Effect**: Physics phenomenon where spinning ball curves due to pressure differential
**Clothoid Spiral (Euler's Spiral)**: Mathematical curve where curvature increases linearly with arc length
**Magnus Coefficient (k_magnus)**: Empirically tuned constant (2.0) controlling force magnitude
**Curvature (κ)**: 1/R where R is radius of curvature; measures trajectory tightness
**R² (coefficient of determination)**: Statistical measure of linear fit quality (1.0 = perfect)
**Menger Curvature**: Geometric formula κ = 4A/(abc) using triangle area and side lengths

---

## Contributing Guidelines

### Adding New Shot Types
1. Create development plan (use `masse_development_plan.txt` as template)
2. Implement Test-Driven Development (TDD) approach
3. Document progress in session log (use `masse_progress_log.txt` format)
4. Create user guide after implementation complete
5. Add entry to this index

### Extending Validation
1. Add test cases to `test/model/pique_validation.spec.ts`
2. Update `PIQUE_VALIDATION_PLAN.md` with new methodology
3. Run tests and capture data to `test/data/pique_trajectories/`
4. Analyze results and update `PIQUE_VALIDATION_REPORT.md`

### Documentation Standards
- Keep this index updated when adding/modifying docs
- Use consistent emoji vocabulary (see "For Human-Readable Docs")
- Always include file paths and line numbers for code references
- Provide both "what" (implementation) and "why" (reasoning) documentation

---

## Version History

- **2025-10-09**: Initial index created
  - Massé implementation complete (31/31 tests passing)
  - Piqué validation completed (12/15 tests passing, physical accuracy confirmed)
  - 8 documentation files indexed

---

## Contact & Support

For questions about this documentation system or the massé/piqué implementation:
- Review the relevant document from index above
- Check `test/model/masse.spec.ts` or `test/model/pique_validation.spec.ts` for examples
- Examine `masse_progress_log.txt` for development history and solved blockers
