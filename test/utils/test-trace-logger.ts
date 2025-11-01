import fs from 'fs'
import path from 'path'

/**
 * Test ortamında trace loglarını dosyaya yazmak için yardımcı fonksiyon
 * Browser ortamındaki trace() ile aynı formatta log yazar
 */
export class TestTraceLogger {
  private logFilePath: string | null = null
  private sessionId: string

  constructor() {
    const rnd = Math.random().toString(36).slice(2, 8)
    const t = Date.now().toString(36)
    this.sessionId = `s-${t}-${rnd}`
  }

  private getOrCreateLogFile(): string {
    if (this.logFilePath) return this.logFilePath

    const logsDir = path.resolve(process.cwd(), 'logs')
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true })
    }

    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    const h = String(now.getHours()).padStart(2, '0')
    const min = String(now.getMinutes()).padStart(2, '0')
    const s = String(now.getSeconds()).padStart(2, '0')
    const rnd = Math.random().toString(36).slice(2, 6)

    this.logFilePath = path.join(logsDir, `test-trajectory-${y}${m}${d}${h}${min}${s}-${rnd}-${this.sessionId}.log`)
    return this.logFilePath
  }

  private safeStringify(value: any): string {
    const seen = new WeakSet()
    return JSON.stringify(
      value,
      (k, v) => {
        // Simplify Vector3 objects
        if (v && typeof v === 'object' && 'x' in v && 'y' in v && 'z' in v &&
            typeof v.x === 'number' && typeof v.y === 'number' && typeof v.z === 'number') {
          return { x: v.x, y: v.y, z: v.z }
        }
        if (v && typeof v === 'object') {
          if (seen.has(v)) return '[Circular]'
          seen.add(v)
        }
        return v
      }
    )
  }

  /**
   * Log data to file in same format as browser trace()
   */
  log(label: string, data?: any) {
    const payload = {
      label,
      data,
      sid: this.sessionId,
      ts: Date.now()
    }

    const jsonLine = this.safeStringify(payload)
    const filepath = this.getOrCreateLogFile()

    fs.appendFileSync(filepath, jsonLine + '\n', 'utf8')
  }

  /**
   * Get the current log file path
   */
  getLogFilePath(): string | null {
    return this.logFilePath
  }
}
