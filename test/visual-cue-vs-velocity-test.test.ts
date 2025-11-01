/**
 * Görsel İsteka Yönü vs Velocity Yönü - Gerçek Görsel Test
 * 
 * Bu test, ekranda görünen CUE MESH yönü ile
 * black arrow (velocity) yönü arasındaki farkı ölçer
 * 
 * @jest-environment jsdom
 */

import { Vector3, Quaternion } from 'three'
import { Cue } from '../src/view/cue'
import { Table } from '../src/model/table'
import { Ball, State } from '../src/model/ball'

describe('Visual Cue Direction vs Velocity Direction', () => {
  let cue
  let table
  let cueball

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

  function testVisualCueDirection(aimAngleDeg, elevationDeg, description) {
    const aimAngle = aimAngleDeg * (Math.PI / 180)
    const elevation = elevationDeg * (Math.PI / 180)

    // Setup cue
    cue.aim.angle = aimAngle
    cue.elevation = elevation
    cue.aim.offset.set(0, 0, 0)
    cue.aim.power = 50
    cue.aim.pos.copy(cueball.pos)

    // Update cue - bu mesh'i konumlandırır
    cue.moveTo(cueball.pos)

    // CUE MESH'den görsel yönü al (kullanıcının ekranda gördüğü)
    // Cue mesh -Y ekseni cue direction'dır
    const cueMeshDirection = new Vector3(0, -1, 0)
      .applyQuaternion(cue.mesh.quaternion)
      .normalize()

    // Hit ve velocity al
    const ballBefore = {
      pos: cueball.pos.clone(),
      vel: cueball.vel.clone(),
      rvel: cueball.rvel.clone()
    }

    cue.hit(cueball)

    const velocityDirection = cueball.vel.clone().normalize()

    // Reset
    cueball.pos.copy(ballBefore.pos)
    cueball.vel.copy(ballBefore.vel)
    cueball.rvel.copy(ballBefore.rvel)
    cueball.state = State.Stationary

    // Açı farkını hesapla - velocity cue'nun TERSİ yönde olmalı (180°)
    const dotProduct = cueMeshDirection.dot(velocityDirection)
    const angleDiff = Math.acos(Math.max(-1, Math.min(1, dotProduct))) * (180 / Math.PI)
    
    // İdeal: 180° (tam ters yön)
    const idealAngle = 180
    const deviationFromIdeal = Math.abs(angleDiff - idealAngle)

    // Detaylı log
    console.log(`\n${'='.repeat(80)}`)
    console.log(`${description}`)
    console.log(`${'='.repeat(80)}`)
    console.log(`\n📐 GİRDİ:`)
    console.log(`   Nişan Açısı: ${aimAngleDeg}°`)
    console.log(`   Elevation: ${elevationDeg}°`)
    
    console.log(`\n🎱 CUE MESH YÖNÜ (Ekranda görünen isteka):`)
    console.log(`   Vektör: (${cueMeshDirection.x.toFixed(4)}, ${cueMeshDirection.y.toFixed(4)}, ${cueMeshDirection.z.toFixed(4)})`)
    console.log(`   X bileşeni: ${cueMeshDirection.x.toFixed(4)}`)
    console.log(`   Y bileşeni: ${cueMeshDirection.y.toFixed(4)}`)
    console.log(`   Z bileşeni (elevation): ${cueMeshDirection.z.toFixed(4)}`)
    console.log(`   Hesaplanan elevation: ${(Math.asin(cueMeshDirection.z) * 180 / Math.PI).toFixed(2)}°`)
    
    console.log(`\n⚡ VELOCITY YÖNÜ (Black arrow):`)
    console.log(`   Vektör: (${velocityDirection.x.toFixed(4)}, ${velocityDirection.y.toFixed(4)}, ${velocityDirection.z.toFixed(4)})`)
    console.log(`   X bileşeni: ${velocityDirection.x.toFixed(4)}`)
    console.log(`   Y bileşeni: ${velocityDirection.y.toFixed(4)}`)
    console.log(`   Z bileşeni (elevation): ${velocityDirection.z.toFixed(4)}`)
    console.log(`   Hesaplanan elevation: ${(Math.asin(velocityDirection.z) * 180 / Math.PI).toFixed(2)}°`)
    
    console.log(`\n🔴 FARK:`)
    console.log(`   Açı Farkı: ${angleDiff.toFixed(2)}° (İdeal: 180°)`)
    console.log(`   İdeal'den Sapma: ${deviationFromIdeal.toFixed(2)}°`)
    console.log(`   X Farkı: ${Math.abs(cueMeshDirection.x - velocityDirection.x).toFixed(4)}`)
    console.log(`   Y Farkı: ${Math.abs(cueMeshDirection.y - velocityDirection.y).toFixed(4)}`)
    console.log(`   Z Farkı: ${Math.abs(cueMeshDirection.z - velocityDirection.z).toFixed(4)}`)
    
    return { angleDiff, deviationFromIdeal, cueMeshDirection, velocityDirection }
  }

  test('CUE MESH yönü ile VELOCITY yönü karşılaştırması', () => {
    console.log('\n' + '='.repeat(80))
    console.log('GERÇEK GÖRSEL TEST: CUE MESH vs BLACK ARROW')
    console.log('='.repeat(80))

    const results = []

    // Düşük elevation
    results.push(testVisualCueDirection(0, 10, 'Test 1: 0° nişan, 10° elevation'))
    results.push(testVisualCueDirection(45, 10, 'Test 2: 45° nişan, 10° elevation'))
    results.push(testVisualCueDirection(90, 10, 'Test 3: 90° nişan, 10° elevation'))

    // Orta elevation
    results.push(testVisualCueDirection(0, 30, 'Test 4: 0° nişan, 30° elevation'))
    results.push(testVisualCueDirection(45, 30, 'Test 5: 45° nişan, 30° elevation'))

    // Yüksek elevation
    results.push(testVisualCueDirection(0, 45, 'Test 6: 0° nişan, 45° elevation'))
    results.push(testVisualCueDirection(0, 65, 'Test 7: 0° nişan, 65° elevation'))
    results.push(testVisualCueDirection(0, 75, 'Test 8: 0° nişan, 75° elevation'))
    results.push(testVisualCueDirection(0, 85, 'Test 9: 0° nişan, 85° elevation'))

    // Özet
    console.log(`\n${'='.repeat(80)}`)
    console.log('ÖZET SONUÇLAR')
    console.log(`${'='.repeat(80)}`)
    
    const avgDiff = results.reduce((sum, r) => sum + r.angleDiff, 0) / results.length
    const maxDiff = Math.max(...results.map(r => r.angleDiff))
    const minDiff = Math.min(...results.map(r => r.angleDiff))
    
    const deviations = results.map(r => r.deviationFromIdeal)
    const avgDeviation = deviations.reduce((sum, d) => sum + d, 0) / deviations.length
    const maxDeviation = Math.max(...deviations)
    const minDeviation = Math.min(...deviations)
    
    console.log(`\nAçı Farkı İstatistikleri:`)
    console.log(`   Minimum: ${minDiff.toFixed(2)}°`)
    console.log(`   Maksimum: ${maxDiff.toFixed(2)}°`)
    console.log(`   Ortalama: ${avgDiff.toFixed(2)}°`)
    
    console.log(`\nİdeal'den (180°) Sapma:`)
    console.log(`   Minimum: ${minDeviation.toFixed(2)}°`)
    console.log(`   Maksimum: ${maxDeviation.toFixed(2)}°`)
    console.log(`   Ortalama: ${avgDeviation.toFixed(2)}°`)
    
    if (maxDeviation > 1) {
      console.log(`\n⚠️  SORUN TESPİT EDİLDİ!`)
      console.log(`   CUE MESH ile VELOCITY 180° açı olmalı ama ${maxDeviation.toFixed(2)}° sapma var!`)
      console.log(`   Bu kullanıcının gördüğü isteka yönü ile topun gittiği yön arasındaki sorundur.`)
    } else {
      console.log(`\n✅ CUE MESH ve VELOCITY mükemmel ters yönde (180°)!`)
    }

    // Başarı kriteri: 180°'den sapma max 1° olmalı (cue ve velocity tam ters yönde)
    expect(maxDeviation).toBeLessThan(1)
  })
})
