/**
 * Elevation Ball Motion Test
 * 
 * Bu test, farklı elevation açılarında topların:
 * - Havaya yükselme miktarını (Z velocity)
 * - Spin miktarını (rotational velocity)
 * - Magnus efekti durumunu
 * gözlemler ve raporlar.
 * 
 * @jest-environment jsdom
 */

import { Vector3 } from 'three'
import { Cue } from '../src/view/cue'
import { Table } from '../src/model/table'
import { Ball, State } from '../src/model/ball'

describe('Elevation Ball Motion Analysis', () => {
  let cue: any
  let table: any
  let cueball: any

  beforeEach(() => {
    const caromBallRadius = 0.061 / 2
    const caromPhysics = {
      R: caromBallRadius,
      m: 0.21,
      muS: 0.2,
      muC: 0.05,
      I: (2/5) * 0.21 * caromBallRadius * caromBallRadius,
      spinStopThreshold: 0.01,
      rollingTransition: 0.05,
      minSeparationSpeed: 0.004
    }
    
    cueball = new Ball(new Vector3(0, 0, caromBallRadius), 0xffffff, caromPhysics)
    table = new Table([cueball])
    cue = new Cue(null, caromBallRadius)
  })

  function testElevation(elevationDeg: number, powerPercent: number = 0.8) {
    const elevation = elevationDeg * (Math.PI / 180)
    
    // Setup cue
    cue.aim.angle = 0 // Straight shot
    cue.elevation = elevation
    cue.aim.offset.set(0, 0, 0) // Center hit
    cue.aim.power = cue.maxPower * powerPercent
    cue.aim.pos.copy(cueball.pos)

    // Update cue position
    cue.moveTo(cueball.pos)

    // Save initial state
    const initialPos = cueball.pos.clone()
    const initialVel = cueball.vel.clone()
    const initialRvel = cueball.rvel.clone()

    // Hit the ball
    cue.hit(cueball)

    // Capture results
    const result = {
      elevation: elevationDeg,
      power: cue.aim.power,
      velocity: {
        x: cueball.vel.x,
        y: cueball.vel.y,
        z: cueball.vel.z,
        magnitude: cueball.vel.length(),
        horizontal: Math.sqrt(cueball.vel.x * cueball.vel.x + cueball.vel.y * cueball.vel.y),
        vertical: cueball.vel.z
      },
      spin: {
        x: cueball.rvel.x,
        y: cueball.rvel.y,
        z: cueball.rvel.z,
        magnitude: cueball.rvel.length()
      },
      magnus: {
        enabled: cueball.magnusEnabled,
        elevation: cueball.magnusElevation
      },
      ratios: {
        verticalToHorizontal: 0,
        verticalToTotal: 0,
        spinToVelocity: 0
      }
    }

    // Calculate ratios
    if (result.velocity.horizontal > 0) {
      result.ratios.verticalToHorizontal = result.velocity.vertical / result.velocity.horizontal
    }
    if (result.velocity.magnitude > 0) {
      result.ratios.verticalToTotal = result.velocity.vertical / result.velocity.magnitude
      if (result.spin.magnitude > 0) {
        result.ratios.spinToVelocity = result.spin.magnitude / result.velocity.magnitude
      }
    }

    // Reset ball
    cueball.pos.copy(initialPos)
    cueball.vel.copy(initialVel)
    cueball.rvel.copy(initialRvel)
    cueball.state = State.Stationary
    cueball.magnusEnabled = false

    return result
  }

  test('should analyze ball motion at 10 different elevation angles', () => {
    console.log('\n' + '='.repeat(80))
    console.log('DİKEY AÇILI VURUŞLARDA TOP HAREKETİ ANALİZİ')
    console.log('='.repeat(80))

    // Test 10 different elevation angles
    const elevations = [5, 15, 25, 35, 45, 55, 65, 75, 85, 89]
    const results: any[] = []

    elevations.forEach((elev, index) => {
      const result = testElevation(elev, 0.8) // 80% power
      results.push(result)

      console.log(`\n📐 TEST ${index + 1}: ${elev}° Elevation`)
      console.log('-'.repeat(80))
      console.log(`⚙️  PARAMETRELER:`)
      console.log(`   Elevation: ${elev}°`)
      console.log(`   Güç: ${(result.power).toFixed(1)} (${(result.power / cue.maxPower * 100).toFixed(0)}%)`)
      console.log(`   Spin Offset: Merkez (0, 0)`)
      
      console.log(`\n⚡ HIZ VEKTÖRÜ:`)
      console.log(`   X: ${result.velocity.x.toFixed(3)}`)
      console.log(`   Y: ${result.velocity.y.toFixed(3)}`)
      console.log(`   Z (Yukarı): ${result.velocity.z.toFixed(3)}`)
      console.log(`   Toplam Hız: ${result.velocity.magnitude.toFixed(3)}`)
      console.log(`   Yatay Hız: ${result.velocity.horizontal.toFixed(3)}`)
      console.log(`   Dikey Hız: ${result.velocity.vertical.toFixed(3)}`)
      
      console.log(`\n🔄 SPIN (Dönme Hızı):`)
      console.log(`   X: ${result.spin.x.toFixed(3)} rad/s`)
      console.log(`   Y: ${result.spin.y.toFixed(3)} rad/s`)
      console.log(`   Z: ${result.spin.z.toFixed(3)} rad/s`)
      console.log(`   Toplam Spin: ${result.spin.magnitude.toFixed(3)} rad/s`)
      
      console.log(`\n🌀 MAGNUS EFEKTİ:`)
      console.log(`   Aktif: ${result.magnus.enabled ? 'EVET ✅' : 'HAYIR ❌'}`)
      if (result.magnus.enabled) {
        console.log(`   Elevation: ${(result.magnus.elevation * 180 / Math.PI).toFixed(1)}°`)
      }
      
      console.log(`\n📊 ORANLAR:`)
      console.log(`   Dikey/Yatay: ${result.ratios.verticalToHorizontal.toFixed(3)}`)
      console.log(`   Dikey/Toplam: ${result.ratios.verticalToTotal.toFixed(3)}`)
      console.log(`   Spin/Hız: ${result.ratios.spinToVelocity.toFixed(3)}`)
    })

    // Summary analysis
    console.log(`\n${'='.repeat(80)}`)
    console.log('ÖZET ANALİZ')
    console.log(`${'='.repeat(80)}`)

    console.log(`\n📈 DİKEY HIZ TRENDİ:`)
    results.forEach(r => {
      const bar = '█'.repeat(Math.round(Math.abs(r.velocity.vertical) * 2))
      console.log(`   ${r.elevation.toString().padStart(2)}°: ${r.velocity.vertical.toFixed(3).padStart(8)} ${bar}`)
    })

    console.log(`\n🔄 SPIN BÜYÜKLÜĞÜ TRENDİ:`)
    results.forEach(r => {
      const bar = '█'.repeat(Math.round(r.spin.magnitude / 5))
      console.log(`   ${r.elevation.toString().padStart(2)}°: ${r.spin.magnitude.toFixed(3).padStart(8)} rad/s ${bar}`)
    })

    console.log(`\n🌀 MAGNUS EFEKTİ DURUMU:`)
    results.forEach(r => {
      const status = r.magnus.enabled ? '✅ Aktif' : '❌ Pasif'
      console.log(`   ${r.elevation.toString().padStart(2)}°: ${status}`)
    })

    console.log(`\n⚠️  KRİTİK GÖZLEMLER:`)
    
    // Find highest vertical velocity
    const maxVertical = results.reduce((max, r) => 
      Math.abs(r.velocity.vertical) > Math.abs(max.velocity.vertical) ? r : max
    )
    console.log(`   En Yüksek Dikey Hız: ${maxVertical.elevation}° (${maxVertical.velocity.vertical.toFixed(3)})`)
    
    // Find highest spin
    const maxSpin = results.reduce((max, r) => 
      r.spin.magnitude > max.spin.magnitude ? r : max
    )
    console.log(`   En Yüksek Spin: ${maxSpin.elevation}° (${maxSpin.spin.magnitude.toFixed(3)} rad/s)`)
    
    // Check Magnus activation
    const magnusActive = results.filter(r => r.magnus.enabled)
    console.log(`   Magnus Aktif: ${magnusActive.length}/${results.length} durum`)
    if (magnusActive.length > 0) {
      const minMagnusElev = Math.min(...magnusActive.map(r => r.elevation))
      console.log(`   Magnus Başlangıç: ${minMagnusElev}° (${(minMagnusElev * Math.PI / 180).toFixed(2)} rad)`)
    }

    // Physics expectations
    console.log(`\n✅ FİZİK BEKLENTİLERİ:`)
    console.log(`   1. Yüksek elevation → Yüksek dikey hız: ${maxVertical.elevation >= 75 ? 'DOĞRU ✅' : 'YANLIŞ ❌'}`)
    console.log(`   2. Yüksek elevation → Yüksek spin: ${maxSpin.elevation >= 65 ? 'DOĞRU ✅' : 'YANLIŞ ❌'}`)
    console.log(`   3. Magnus elevation > 0.2 rad (11.5°): ${magnusActive.length > 0 && magnusActive[0].elevation > 11 ? 'DOĞRU ✅' : 'YANLIŞ ❌'}`)
    
    // Verify high elevation shots show significant vertical motion
    const highElevShots = results.filter(r => r.elevation >= 65)
    const avgVerticalHigh = highElevShots.reduce((sum, r) => sum + Math.abs(r.velocity.vertical), 0) / highElevShots.length
    
    console.log(`\n🎯 YÜKSEK ELEVASYON DAVRANIŞI (≥65°):`)
    console.log(`   Ortalama Dikey Hız: ${avgVerticalHigh.toFixed(3)}`)
    console.log(`   Product Ortam Uyumlu: ${avgVerticalHigh > 2 ? 'EVET ✅' : 'HAYIR ❌'}`)
    console.log(`   Magnus Aktif: ${magnusActive.length > 0 ? 'EVET ✅' : 'HAYIR ❌'}`)
    console.log(`   Spin Miktarı Yüksek: ${maxSpin.spin.magnitude > 300 ? 'EVET ✅' : 'HAYIR ❌'}`)

    console.log('\n' + '='.repeat(80) + '\n')

    // Test assertions
    expect(results.length).toBe(10)
    expect(maxVertical.elevation).toBeGreaterThanOrEqual(75) // Highest vertical should be at high elevation
    expect(avgVerticalHigh).toBeGreaterThan(2) // High elevation shots have vertical velocity
    expect(magnusActive.length).toBeGreaterThan(0) // Magnus should be active for some shots
  })
})
