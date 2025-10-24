/**
 * 3 Cushion Billiards - Angle Difference Analysis
 * 
 * Bu test, 3 bant oyun modunda görsel arayüzdeki isteka açısı ile 
 * fizik motoruna aktarılan darbe açısı arasındaki farkları ölçer.
 * 
 * Test Kapsamı:
 * - 30 farklı atış kombinasyonu
 * - Farklı kamera nişan alma açıları
 * - Top üzerinde farklı spin noktaları
 * - Farklı isteka elevasyonları
 * 
 * @jest-environment jsdom
 */

import { Vector3 } from 'three'
import { Cue } from '../src/view/cue'
import { Table } from '../src/model/table'
import { Ball, State } from '../src/model/ball'

describe('3 Cushion - Angle Difference Analysis', () => {
  let cue
  let table
  let cueball
  let results = []

  beforeEach(() => {
    // Clear results array before each test
    results = []
    // 3 cushion table setup (carom ball radius)
    const caromBallRadius = 0.061 / 2 // 61mm diameter balls
    
    // Create physics context for carom balls
    const caromPhysics = {
      R: caromBallRadius,
      m: 0.21, // 210g carom ball
      muS: 0.2,
      muC: 0.05,
      I: (2/5) * 0.21 * caromBallRadius * caromBallRadius,
      spinStopThreshold: 0.01,
      rollingTransition: 0.05,
      minSeparationSpeed: 0.004
    }
    
    // Setup cueball at center of table with carom physics
    cueball = new Ball(new Vector3(0, 0, caromBallRadius), 0xffffff, caromPhysics)
    
    // Create table with cueball
    table = new Table([cueball])
    
    // Create cue with carom ball radius
    cue = new Cue(null, caromBallRadius)
  })

  /**
   * Helper: Görsel arayüzden isteka yönü hesapla (mesh quaternion'dan)
   */
  function calculateVisualCueDirection() {
    // Get actual cue mesh direction (what user sees on screen)
    // Mesh -Y axis points in cue direction (from handle to tip)
    return new Vector3(0, -1, 0).applyQuaternion(cue.mesh.quaternion).normalize()
  }

  /**
   * Helper: Fizik motoruna gönderilen hız vektörünün yönünü hesapla
   */
  function calculatePhysicsVelocityDirection(velocity) {
    return velocity.clone().normalize()
  }

  /**
   * Helper: İki vektör arasındaki açı farkını hesapla (her eksen için)
   */
  function calculateAngleDifferences(visual, physics) {
    // X ekseni etrafında rotasyon açısı (pitch)
    const visualPitchX = Math.atan2(visual.z, visual.y) * (180 / Math.PI)
    const physicsPitchX = Math.atan2(physics.z, physics.y) * (180 / Math.PI)
    const diffX = physicsPitchX - visualPitchX

    // Y ekseni etrafında rotasyon açısı (yaw)
    const visualPitchY = Math.atan2(visual.z, visual.x) * (180 / Math.PI)
    const physicsPitchY = Math.atan2(physics.z, physics.x) * (180 / Math.PI)
    const diffY = physicsPitchY - visualPitchY

    // Z ekseni etrafında rotasyon açısı (roll) - yatay düzlemde
    const visualYaw = Math.atan2(visual.y, visual.x) * (180 / Math.PI)
    const physicsYaw = Math.atan2(physics.y, physics.x) * (180 / Math.PI)
    const diffZ = physicsYaw - visualYaw

    // Genel açı farkı (vektörler arası açı)
    const dotProduct = visual.dot(physics)
    const generalAngle = Math.acos(Math.max(-1, Math.min(1, dotProduct))) * (180 / Math.PI)

    return {
      xAxis: diffX,
      yAxis: diffY,
      zAxis: diffZ,
      general: generalAngle,
      visual: {
        pitchX: visualPitchX,
        pitchY: visualPitchY,
        yaw: visualYaw
      },
      physics: {
        pitchX: physicsPitchX,
        pitchY: physicsPitchY,
        yaw: physicsYaw
      }
    }
  }

  /**
   * Test runner: Bir kombinasyonu test et
   */
  function testCombination(testId, aimAngleDeg, elevationDeg, offsetX, offsetY, power, description) {
    const aimAngle = aimAngleDeg * (Math.PI / 180)
    const elevation = elevationDeg * (Math.PI / 180)

    // Setup cue
    cue.aim.angle = aimAngle
    cue.elevation = elevation
    cue.aim.offset.set(offsetX, offsetY, 0)
    cue.aim.power = power
    cue.aim.pos.copy(cueball.pos)

    // Update cue position and hit point
    cue.moveTo(cueball.pos)

    // Calculate visual direction from mesh (after moveTo has positioned the cue)
    const visualDirection = calculateVisualCueDirection()

    // Simulate hit and get physics velocity
    const ballBefore = {
      pos: cueball.pos.clone(),
      vel: cueball.vel.clone(),
      rvel: cueball.rvel.clone()
    }

    cue.hit(cueball)

    const physicsVelocity = cueball.vel.clone()
    const physicsDirection = calculatePhysicsVelocityDirection(physicsVelocity)

    // Calculate differences
    const differences = calculateAngleDifferences(visualDirection, physicsDirection)

    // Store result
    const result = {
      testId,
      description,
      input: {
        aimAngle: aimAngleDeg,
        elevation: elevationDeg,
        offsetX,
        offsetY,
        power
      },
      visual: {
        direction: {
          x: visualDirection.x,
          y: visualDirection.y,
          z: visualDirection.z
        },
        angles: differences.visual
      },
      physics: {
        direction: {
          x: physicsDirection.x,
          y: physicsDirection.y,
          z: physicsDirection.z
        },
        velocity: {
          x: physicsVelocity.x,
          y: physicsVelocity.y,
          z: physicsVelocity.z
        },
        angles: differences.physics
      },
      differences: {
        xAxis: differences.xAxis,
        yAxis: differences.yAxis,
        zAxis: differences.zAxis,
        general: differences.general
      }
    }

    results.push(result)

    // Reset ball
    cueball.pos.copy(ballBefore.pos)
    cueball.vel.copy(ballBefore.vel)
    cueball.rvel.copy(ballBefore.rvel)
    cueball.state = State.Stationary

    return result
  }

  /**
   * Ana Test: 30 farklı kombinasyon
   */
  test('should analyze angle differences for 30 shot combinations', () => {
    console.log('\n' + '='.repeat(80))
    console.log('3 BANT OYUN MODU - AÇILI FARK ANALİZİ')
    console.log('='.repeat(80) + '\n')

    let testId = 1

    // Test Set 1: Farklı nişan açıları (0°, 45°, 90°, 135°, 180°) - merkez vuruş, düşük elevation
    console.log('\n📊 TEST SET 1: Farklı Nişan Açıları (Merkez Vuruş, Düşük Elevation)')
    console.log('-'.repeat(80))
    
    const aimAngles = [0, 45, 90, 135, 180]
    aimAngles.forEach(angle => {
      testCombination(
        testId++,
        angle,
        10, // 10° elevation
        0,  // center X
        0,  // center Y
        50, // medium power
        `Nişan ${angle}° - Merkez - 10° Elevation`
      )
    })

    // Test Set 2: Farklı spin noktaları - 45° nişan, düşük elevation
    console.log('\n📊 TEST SET 2: Farklı Spin Noktaları (45° Nişan, 10° Elevation)')
    console.log('-'.repeat(80))
    
    const spinPoints = [
      { x: 0, y: 0, desc: 'Merkez' },
      { x: 0, y: 0.5, desc: 'Üst' },
      { x: 0, y: -0.5, desc: 'Alt' },
      { x: 0.5, y: 0, desc: 'Sağ' },
      { x: -0.5, y: 0, desc: 'Sol' }
    ]
    
    spinPoints.forEach(spin => {
      testCombination(
        testId++,
        45,
        10,
        spin.x,
        spin.y,
        50,
        `45° Nişan - ${spin.desc} Spin - 10° Elevation`
      )
    })

    // Test Set 3: Farklı elevasyonlar - 90° nişan, merkez vuruş
    console.log('\n📊 TEST SET 3: Farklı Elevasyonlar (90° Nişan, Merkez Vuruş)')
    console.log('-'.repeat(80))
    
    const elevations = [5, 15, 25, 35, 45]
    elevations.forEach(elev => {
      testCombination(
        testId++,
        90,
        elev,
        0,
        0,
        50,
        `90° Nişan - Merkez - ${elev}° Elevation`
      )
    })

    // Test Set 4: Kombinasyonlar - yüksek elevation + spin
    console.log('\n📊 TEST SET 4: Kombinasyonlar (Yüksek Elevation + Spin)')
    console.log('-'.repeat(80))
    
    const combinations = [
      { angle: 0, elev: 30, x: 0, y: 0.5, desc: '0° - Üst Spin - 30° Elev' },
      { angle: 45, elev: 30, x: 0.5, y: 0, desc: '45° - Sağ Spin - 30° Elev' },
      { angle: 90, elev: 30, x: 0, y: -0.5, desc: '90° - Alt Spin - 30° Elev' },
      { angle: 135, elev: 30, x: -0.5, y: 0, desc: '135° - Sol Spin - 30° Elev' },
      { angle: 180, elev: 30, x: 0.5, y: 0.5, desc: '180° - Sağ-Üst - 30° Elev' }
    ]
    
    combinations.forEach(combo => {
      testCombination(
        testId++,
        combo.angle,
        combo.elev,
        combo.x,
        combo.y,
        50,
        combo.desc
      )
    })

    // Test Set 5: Yüksek Elevasyonlar (65°, 75°, 85°)
    console.log('\n📊 TEST SET 5: Yüksek Elevasyonlar (65°, 75°, 85°)')
    console.log('-'.repeat(80))
    
    const highElevations = [65, 75, 85]
    highElevations.forEach(elev => {
      testCombination(
        testId++,
        0,
        elev,
        0,
        0,
        50,
        `0° Nişan - Merkez - ${elev}° Elevation`
      )
    })

    // Test Set 6: Ekstrem durumlar
    console.log('\n📊 TEST SET 6: Ekstrem Durumlar')
    console.log('-'.repeat(80))
    
    const extremes = [
      { angle: 0, elev: 5, x: 0, y: 0, power: 20, desc: 'Minimum - Düşük Güç' },
      { angle: 90, elev: 45, x: 0.7, y: 0.7, power: 80, desc: 'Maksimum - Yüksek Güç' },
      { angle: 180, elev: 20, x: -0.7, y: 0, power: 50, desc: 'Sol Ekstrem Spin' },
      { angle: 270, elev: 35, x: 0, y: -0.7, power: 60, desc: 'Alt Ekstrem Spin' },
      { angle: 315, elev: 25, x: 0.5, y: -0.5, power: 70, desc: 'Diagonal Spin' }
    ]
    
    extremes.forEach(extreme => {
      testCombination(
        testId++,
        extreme.angle,
        extreme.elev,
        extreme.x,
        extreme.y,
        extreme.power,
        extreme.desc
      )
    })

    // Generate detailed report
    console.log('\n' + '='.repeat(80))
    console.log('DETAYLI SONUÇ RAPORU')
    console.log('='.repeat(80) + '\n')

    results.forEach(result => {
      console.log(`\n🎯 Test #${result.testId}: ${result.description}`)
      console.log('-'.repeat(80))
      console.log(`📥 GİRDİ:`)
      console.log(`   Nişan Açısı: ${result.input.aimAngle}°`)
      console.log(`   Elevation: ${result.input.elevation}°`)
      console.log(`   Spin Offset: (${result.input.offsetX.toFixed(2)}, ${result.input.offsetY.toFixed(2)})`)
      console.log(`   Güç: ${result.input.power}`)
      
      console.log(`\n👁️  GÖRSEL ARAYÜZ:`)
      console.log(`   Yön Vektörü: (${result.visual.direction.x.toFixed(4)}, ${result.visual.direction.y.toFixed(4)}, ${result.visual.direction.z.toFixed(4)})`)
      console.log(`   Pitch (X ekseni): ${result.visual.angles.pitchX.toFixed(2)}°`)
      console.log(`   Pitch (Y ekseni): ${result.visual.angles.pitchY.toFixed(2)}°`)
      console.log(`   Yaw (Z ekseni): ${result.visual.angles.yaw.toFixed(2)}°`)
      
      console.log(`\n⚙️  FİZİK MOTORU:`)
      console.log(`   Yön Vektörü: (${result.physics.direction.x.toFixed(4)}, ${result.physics.direction.y.toFixed(4)}, ${result.physics.direction.z.toFixed(4)})`)
      console.log(`   Hız Vektörü: (${result.physics.velocity.x.toFixed(2)}, ${result.physics.velocity.y.toFixed(2)}, ${result.physics.velocity.z.toFixed(2)})`)
      console.log(`   Pitch (X ekseni): ${result.physics.angles.pitchX.toFixed(2)}°`)
      console.log(`   Pitch (Y ekseni): ${result.physics.angles.pitchY.toFixed(2)}°`)
      console.log(`   Yaw (Z ekseni): ${result.physics.angles.yaw.toFixed(2)}°`)
      
      console.log(`\n📊 FARKLAR:`)
      console.log(`   X Ekseni Farkı: ${result.differences.xAxis.toFixed(2)}°`)
      console.log(`   Y Ekseni Farkı: ${result.differences.yAxis.toFixed(2)}°`)
      console.log(`   Z Ekseni Farkı: ${result.differences.zAxis.toFixed(2)}°`)
      console.log(`   Genel Açı Farkı: ${result.differences.general.toFixed(2)}°`)
    })

    // Summary statistics
    console.log('\n' + '='.repeat(80))
    console.log('İSTATİSTİKSEL ÖZET')
    console.log('='.repeat(80) + '\n')

    const xDiffs = results.map(r => Math.abs(r.differences.xAxis))
    const yDiffs = results.map(r => Math.abs(r.differences.yAxis))
    const zDiffs = results.map(r => Math.abs(r.differences.zAxis))
    const generalDiffs = results.map(r => r.differences.general)

    const stats = {
      xAxis: {
        min: Math.min(...xDiffs),
        max: Math.max(...xDiffs),
        avg: xDiffs.reduce((a, b) => a + b, 0) / xDiffs.length
      },
      yAxis: {
        min: Math.min(...yDiffs),
        max: Math.max(...yDiffs),
        avg: yDiffs.reduce((a, b) => a + b, 0) / yDiffs.length
      },
      zAxis: {
        min: Math.min(...zDiffs),
        max: Math.max(...zDiffs),
        avg: zDiffs.reduce((a, b) => a + b, 0) / zDiffs.length
      },
      general: {
        min: Math.min(...generalDiffs),
        max: Math.max(...generalDiffs),
        avg: generalDiffs.reduce((a, b) => a + b, 0) / generalDiffs.length
      }
    }

    console.log(`📐 X Ekseni (Pitch):`)
    console.log(`   Min: ${stats.xAxis.min.toFixed(2)}°`)
    console.log(`   Max: ${stats.xAxis.max.toFixed(2)}°`)
    console.log(`   Ortalama: ${stats.xAxis.avg.toFixed(2)}°\n`)

    console.log(`📐 Y Ekseni (Pitch):`)
    console.log(`   Min: ${stats.yAxis.min.toFixed(2)}°`)
    console.log(`   Max: ${stats.yAxis.max.toFixed(2)}°`)
    console.log(`   Ortalama: ${stats.yAxis.avg.toFixed(2)}°\n`)

    console.log(`📐 Z Ekseni (Yaw):`)
    console.log(`   Min: ${stats.zAxis.min.toFixed(2)}°`)
    console.log(`   Max: ${stats.zAxis.max.toFixed(2)}°`)
    console.log(`   Ortalama: ${stats.zAxis.avg.toFixed(2)}°\n`)

    console.log(`📐 Genel Açı Farkı:`)
    console.log(`   Min: ${stats.general.min.toFixed(2)}°`)
    console.log(`   Max: ${stats.general.max.toFixed(2)}°`)
    console.log(`   Ortalama: ${stats.general.avg.toFixed(2)}°\n`)

    // Critical cases (largest differences)
    console.log('⚠️  EN BÜYÜK FARKLARA SAHİP DURUMLAR:\n')
    
    const sortedByGeneral = [...results].sort((a, b) => b.differences.general - a.differences.general)
    sortedByGeneral.slice(0, 5).forEach((result, idx) => {
      console.log(`${idx + 1}. Test #${result.testId}: ${result.description}`)
      console.log(`   Genel Fark: ${result.differences.general.toFixed(2)}°`)
      console.log(`   X: ${result.differences.xAxis.toFixed(2)}°, Y: ${result.differences.yAxis.toFixed(2)}°, Z: ${result.differences.zAxis.toFixed(2)}°\n`)
    })

    console.log('='.repeat(80) + '\n')

    // Cue ve velocity tam ters yönde olmalı (180°)
    // İdeal'den sapma kontrolü
    const deviationFrom180 = Math.abs(stats.general.avg - 180)
    
    console.log(`\n🎯 İDEAL AÇIDAN SAPMA:`)
    console.log(`   İdeal Açı: 180° (cue ve velocity ters yönde)`)
    console.log(`   Ortalama Açı: ${stats.general.avg.toFixed(2)}°`)
    console.log(`   Sapma: ${deviationFrom180.toFixed(2)}°`)
    
    // Test assertions
    expect(results.length).toBeGreaterThanOrEqual(25) // At least 25 tests should complete
    expect(deviationFrom180).toBeLessThan(1) // 180°'den sapma 1°'den az olmalı
  })
})
