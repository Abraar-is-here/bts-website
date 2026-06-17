import createGlobe from 'https://esm.sh/cobe@0.6.3'

;(function () {
  'use strict'

  const canvas = document.getElementById('globe-canvas')
  if (!canvas) return

  const dpr = Math.min(window.devicePixelRatio || 1, 2)

  /* ── Rotation state ─────────────────────────────────────────────────────── */
  // phi ≈ 0 → prime meridian faces viewer → UK visible from the start
  let phi        = 0.1
  let baseTheta  = 0.28
  let phiDelta   = 0
  let thetaDelta = 0
  let startX     = 0
  let startY     = 0
  let dragging   = false

  let livePhi   = phi
  let liveTheta = baseTheta

  /* ── Bristol marker ─────────────────────────────────────────────────────── */
  // Label disabled — marker dot still renders via cobe markers array below.
  const BRISTOL_LAT = 51.4545
  const BRISTOL_LON = -2.5879

  /* ── Create globe ───────────────────────────────────────────────────────── */
  const globe = createGlobe(canvas, {
    devicePixelRatio: dpr,
    width:  460 * dpr,
    height: 460 * dpr,
    phi,
    theta:         baseTheta,
    dark:          0,
    diffuse:       1.4,
    mapSamples:    20000,
    mapBrightness: 9,
    opacity:       0.78,
    baseColor:    [0.95, 0.97, 1.00],
    markerColor:  [0.15, 0.40, 1.00],
    glowColor:    [0.94, 0.93, 0.91],
    markers: [{ location: [BRISTOL_LAT, BRISTOL_LON], size: 0.04 }],
    onRender (state) {
      if (!dragging) phi += 0.0008

      livePhi   = phi + phiDelta / 200
      liveTheta = baseTheta + thetaDelta * 0.003

      state.phi   = livePhi
      state.theta = liveTheta

      const w = canvas.offsetWidth * dpr
      if (w > 0) { state.width = w; state.height = w }
    },
  })

  /* ── Fade in ────────────────────────────────────────────────────────────── */
  canvas.style.opacity    = '0'
  canvas.style.transition = 'opacity 1.2s ease'
  setTimeout(() => { canvas.style.opacity = '1' }, 200)

  /* ── Pointer / drag ─────────────────────────────────────────────────────── */
  canvas.addEventListener('pointerdown', e => {
    dragging   = true
    startX     = e.clientX
    startY     = e.clientY
    phiDelta   = thetaDelta = 0
    canvas.classList.add('is-grabbing')
    e.preventDefault()
  }, { passive: false })

  window.addEventListener('pointermove', e => {
    if (!dragging) return
    phiDelta   = e.clientX - startX
    thetaDelta = e.clientY - startY
  }, { passive: true })

  window.addEventListener('pointerup', () => {
    if (!dragging) return
    phi       += phiDelta   / 200
    baseTheta += thetaDelta * 0.003
    phiDelta   = thetaDelta = 0
    dragging   = false
    canvas.classList.remove('is-grabbing')
  }, { passive: true })

  /* ── Keyboard ───────────────────────────────────────────────────────────── */
  canvas.addEventListener('keydown', e => {
    const s = 0.12
    if (e.key === 'ArrowLeft')  { phi       -= s; e.preventDefault() }
    if (e.key === 'ArrowRight') { phi       += s; e.preventDefault() }
    if (e.key === 'ArrowUp')    { baseTheta -= s / 4; e.preventDefault() }
    if (e.key === 'ArrowDown')  { baseTheta += s / 4; e.preventDefault() }
  })

  window.addEventListener('pagehide', () => globe.destroy(), { once: true })
}())
