import { SRGBColorSpace, VSMShadowMap, WebGLRenderer } from "three"

export function renderer(element: HTMLElement) {
  if (typeof process !== "undefined") {
    return undefined
  }

  const renderer = new WebGLRenderer({ antialias: true })
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = VSMShadowMap
  renderer.shadowMap.autoUpdate = true
  renderer.autoClear = false
  renderer.setSize(element.offsetWidth, element.offsetHeight)
  const pixelRatio = Math.min(window.devicePixelRatio, 2)
  renderer.setPixelRatio(pixelRatio)
  renderer.outputColorSpace = SRGBColorSpace
  element.appendChild(renderer.domElement)
  return renderer
}
