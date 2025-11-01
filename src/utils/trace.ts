// Lightweight tracing helper for development.
// Usage (Browser): set window.__trajectoryTrace to true | 'json' | 'file'
// Usage (Node/Test): set global.__trajectoryTrace to 'file'
// - true  => console.log(label, data)
// - 'json' => console.log single-line JSON string
// - 'file' => POST to /__log (browser) or write to logs/test-*.log (Node.js)

// Node.js file system support
let fs: any = null
let path: any = null
let logFilePath: string | null = null

// Buffer for helper logs: keep only the latest helper group
// A group starts with 'helper_shot' followed by multiple 'helper_event' entries.
let helperBuffer: Array<{ label: string; data: any }> = []

// Helper predictions are buffered: only the latest helper group is flushed
// to file when an actual 'shot' occurs. This avoids writing aim changes
// that never result in a shot.

// Initialize fs/path for Node.js environment
function initNodeModules() {
  if (fs !== null) return // Already initialized

  try {
    // Only load fs/path in Node.js environment (not in browser)
    if (typeof window === 'undefined' && typeof process !== 'undefined') {
      fs = eval("require('fs')")
      path = eval("require('path')")
      // silent init in Node.js
    }
  } catch (err) {
    // silent failure — tracing remains no-op without fs
  }
}

// Auto-initialize on module load in Node environment
if (typeof window === 'undefined') {
  initNodeModules()
}

function getSessionId(): string {
  try {
    const w: any = (typeof window !== 'undefined') ? (window as any) : null
    if (w) {
      if (!w.__trajectorySessionId) {
        const rnd = Math.random().toString(36).slice(2, 8)
        const t = Date.now().toString(36)
        w.__trajectorySessionId = `s-${t}-${rnd}`
      }
      return w.__trajectorySessionId
    }

    // Node.js environment
    const g: any = (typeof global !== 'undefined') ? (global as any) : null
    if (g) {
      if (!g.__trajectorySessionId) {
        const rnd = Math.random().toString(36).slice(2, 8)
        const t = Date.now().toString(36)
        g.__trajectorySessionId = `s-${t}-${rnd}`
      }
      return g.__trajectorySessionId
    }
  } catch {}
  return `s-${Date.now().toString(36)}`
}

function getBrowserId(): string {
  try {
    const w: any = (typeof window !== 'undefined') ? (window as any) : null
    if (w && !w.__trajectoryBrowserId) {
      const now = new Date()
      const y = now.getFullYear()
      const m = String(now.getMonth() + 1).padStart(2, '0')
      const d = String(now.getDate()).padStart(2, '0')
      const h = String(now.getHours()).padStart(2, '0')
      const min = String(now.getMinutes()).padStart(2, '0')
      const s = String(now.getSeconds()).padStart(2, '0')
      const rnd = Math.random().toString(36).slice(2, 6)
      w.__trajectoryBrowserId = `${y}${m}${d}${h}${min}${s}-${rnd}`
    }
    return w?.__trajectoryBrowserId || 'unknown'
  } catch {}
  return 'unknown'
}

function getOrCreateLogFile(): string | null {
  if (!fs || !path) return null

  if (logFilePath) return logFilePath

  try {
    // Find project root by looking for package.json
    let currentDir = __dirname
    let logsDir = null

    for (let i = 0; i < 10; i++) {
      const packageJsonPath = path.join(currentDir, 'package.json')
      if (fs.existsSync(packageJsonPath)) {
        logsDir = path.join(currentDir, 'logs')
        break
      }
      currentDir = path.dirname(currentDir)
    }

    if (!logsDir) {
      logsDir = path.resolve(process.cwd(), 'logs')
    }

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
    const sid = getSessionId()

    logFilePath = path.join(logsDir, `test-trajectory-${y}${m}${d}${h}${min}${s}-${rnd}-${sid}.log`)
    return logFilePath
  } catch {
    return null
  }
}

function writeToNodeFile(line: string) {
  if (!fs) {
    console.log('[trace] fs not available, skipping file write')
    return
  }

  try {
    const filepath = getOrCreateLogFile()
    if (!filepath) {
      console.log('[trace] could not get log file path')
      return
    }

    fs.appendFileSync(filepath, line + '\n', 'utf8')
  } catch (err) {
    // swallow file write errors silently
  }
}

function simplifyVectorXYZ(value: any) {
  if (
    value &&
    typeof value === 'object' &&
    'x' in value && 'y' in value && 'z' in value &&
    typeof (value as any).x === 'number' &&
    typeof (value as any).y === 'number' &&
    typeof (value as any).z === 'number'
  ) {
    const { x, y, z } = value as any
    return { x, y, z }
  }
  return null
}

export function safeStringify(value: any): string {
  const seen = new WeakSet()
  return JSON.stringify(
    value,
    (k, v) => {
      const simplified = simplifyVectorXYZ(v)
      if (simplified) return simplified
      if (v && typeof v === 'object') {
        if (seen.has(v)) return '[Circular]'
        seen.add(v)
      }
      return v
    }
  )
}

async function postLog(line: string) {
  try {
    // Use browser fetch; ignore result
    await fetch('/__log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: line,
    })
  } catch (_) {
    // Swallow errors to avoid affecting app flow
  }
}

export function trace(label: string, data?: any) {
  try {
    // Check both window (browser) and global (Node.js) for trace mode
    const w: any = (typeof window !== 'undefined') ? (window as any) : null
    const g: any = (typeof global !== 'undefined') ? (global as any) : null
    const mode = w?.__trajectoryTrace || g?.__trajectoryTrace

    if (!mode) return

    // Special handling for helper logs: buffer and only flush on actual shot
    if (label === 'helper_shot') {
      // Start a new helper group (drop previous helper logs)
      helperBuffer = [{ label, data }]
      return
    }
    if (label === 'helper_event') {
      // Append to current helper group if exists; otherwise start one implicitly
      if (helperBuffer.length === 0) {
        helperBuffer.push({ label: 'helper_shot', data: undefined })
      }
      helperBuffer.push({ label, data })
      return
    }

    // On real shot, first flush the latest helper group, then write the shot
    if (label === 'shot') {
      if (helperBuffer.length > 0) {
        for (const entry of helperBuffer) {
          if (!entry) continue
          const { label: hl, data: hd } = entry
          if (!hl) continue
          writeTraceEntry(hl, hd, w, g, mode)
        }
        helperBuffer = []
      }
      writeTraceEntry(label, data, w, g, mode)
      return
    }

    // Default: write immediately
    writeTraceEntry(label, data, w, g, mode)
  } catch (_) {
    // no-op
  }
}

function writeTraceEntry(label: string, data: any, w: any, g: any, mode: any) {
  try {
    // Check for custom write function (used in tests)
    const customWrite = w?.__trajectoryTraceWrite || g?.__trajectoryTraceWrite
    if (customWrite && typeof customWrite === 'function') {
      customWrite(label, data)
      return
    }

    const sid = getSessionId()
    const ts = Date.now()
    const bid = w ? getBrowserId() : undefined

    const payload = bid
      ? { label, data, sid, ts, bid }
      : { label, data, sid, ts }

    if (mode === true) {
      console.log('[trace]', label, data)
      return
    }

    const jsonLine = safeStringify(payload)

    if (mode === 'json') {
      console.log(jsonLine)
      return
    }

    if (mode === 'file') {
      // Browser: POST to server
      if (w) {
        void postLog(jsonLine)
        return
      }

      // Node.js: Write to file
      if (g && fs) {
        writeToNodeFile(jsonLine)
        return
      }
    }
  } catch (_) {
    // no-op
  }
}

export default trace
