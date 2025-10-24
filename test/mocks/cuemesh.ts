// Mock CueMesh for testing
export class CueMesh {
  static createCue() {
    return {
      position: { x: 0, y: 0, z: 0, set: jest.fn(), copy: jest.fn(), clone: jest.fn(), addScaledVector: jest.fn() },
      rotation: { z: 0 },
      quaternion: { x: 0, y: 0, z: 0, w: 1 },
      setRotationFromQuaternion: jest.fn(),
      visible: true
    }
  }

  static createPlacer() {
    return {
      position: { x: 0, y: 0, z: 0, copy: jest.fn() },
      rotation: { z: 0 },
      visible: false
    }
  }

  static createHitPoint() {
    return {
      position: { x: 0, y: 0, z: 0, copy: jest.fn(), clone: jest.fn(), addScaledVector: jest.fn(), sub: jest.fn(() => ({ x: 0, y: 0, z: 0, clone: jest.fn() })) },
      setRotationFromQuaternion: jest.fn(),
      visible: true
    }
  }

  static createVirtualCue() {
    return {
      position: { x: 0, y: 0, z: 0, copy: jest.fn() },
      setRotationFromQuaternion: jest.fn(),
      visible: false
    }
  }
}
