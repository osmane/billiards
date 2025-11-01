// Canvas mock for jsdom environment
global.HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
  fillRect: jest.fn(),
  clearRect: jest.fn(),
  getImageData: jest.fn((x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h })),
  putImageData: jest.fn((_img, _x, _y) => {}),
  createImageData: jest.fn((w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h })),
  setTransform: jest.fn(),
  drawImage: jest.fn(),
  save: jest.fn(),
  fillText: jest.fn(),
  restore: jest.fn(),
  beginPath: jest.fn(),
  moveTo: jest.fn(),
  lineTo: jest.fn(),
  closePath: jest.fn(),
  stroke: jest.fn(),
  translate: jest.fn(),
  scale: jest.fn(),
  rotate: jest.fn(),
  arc: jest.fn(),
  fill: jest.fn(),
  measureText: jest.fn(() => ({ width: 0 })),
  transform: jest.fn(),
  rect: jest.fn(),
  clip: jest.fn(),
  createLinearGradient: jest.fn(() => ({
    addColorStop: jest.fn()
  })),
  createRadialGradient: jest.fn(() => ({
    addColorStop: jest.fn()
  }))
}))

// Enable trace logging for all tests (will write to logs/test-*.log)
global.__trajectoryTrace = 'file'

// Override global trace function with TestTraceLogger
const { TestTraceLogger } = require('./utils/test-trace-logger')
const globalTestLogger = new TestTraceLogger()

// Override trace function to use TestTraceLogger
global.__trajectoryTraceWrite = function(label, data) {
  globalTestLogger.log(label, data)
}

// Store logger instance for tests to access
global.__trajectoryTestLogger = globalTestLogger
