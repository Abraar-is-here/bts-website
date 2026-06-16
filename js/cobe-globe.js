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

  /* ── Bristol label ──────────────────────────────────────────────────────── */
  const label = document.createElement('div')
  label.textContent = 'Bristol'

  const arrow = document.createElement('span')
  Object.assign(arrow.style, {
    position:       'absolute',
    top:            '100%',
    left:           '50%',
    transform:      'translate(-50%, -1px)',
    border:         '5px solid transparent',
    borderTopColor: 'var(--c-navy, #0a1a3f)',
    display:        'block',
    width:          '0',
    height:         '0',
  })
  label.appendChild(arrow)

  Object.assign(label.style, {
    position:      'absolute',
    pointerEvents: 'none',
    fontFamily:    'var(--font-body, sans-serif)',
    fontSize:      '0.6rem',
    fontWeight:    '600',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color:         '#fff',
    background:    'var(--c-navy, #0a1a3f)',
    padding:       '3px 7px',
    borderRadius:  '3px',
    whiteSpace:    'nowrap',
    transition:    'opacity 0.3s ease',
    opacity:       '0',
    transform:     'translate(-50%, calc(-100% - 10px))',
  })

  const wrap = canvas.parentElement
  if (wrap && getComputedStyle(wrap).position === 'static') {
    wrap.style.position = 'relative'
  }
  wrap?.appendChild(label)

  /* ── 3D → 2D projection ─────────────────────────────────────────────────── */
  // cobe convention: viewer looks along +Z.
  // A geographic point (lat, lon) maps to:
  //   x = cos(lat) * sin(lon - phi)   ← screen horizontal
  //   y = sin(lat)                     ← screen vertical (up)
  //   z = cos(lat) * cos(lon - phi)   ← depth (+ = toward viewer)
  // Then theta tilts around the X axis.
  function project (latDeg, lonDeg, curPhi, curTheta, size) {
    const lat    = latDeg * Math.PI / 180
    const lon    = lonDeg * Math.PI / 180
    const dLon   = lon - curPhi
    const cosLat = Math.cos(lat)

    const x  = cosLat * Math.sin(dLon)   // screen-x
    const y0 = Math.sin(lat)             // screen-y (pre-tilt)
    const z0 = cosLat * Math.cos(dLon)   // depth (pre-tilt)

    // Rotate around X axis by curTheta
    const cosT = Math.cos(curTheta)
    const sinT = Math.sin(curTheta)
    const y    = y0 * cosT - z0 * sinT
    const z    = y0 * sinT + z0 * cosT

    const r = size / 2
    return {
      x:       r + x * r,
      y:       r - y * r,
      visible: z > 0.05,
    }
  }

  function updateLabel () {
    const size = canvas.offsetWidth
    if (size > 0 && wrap) {
      const p          = project(BRISTOL_LAT, BRISTOL_LON, livePhi, liveTheta, size)
      // canvas may be centered inside wrap (e.g. via flexbox/margin:auto)
      // offset its rect so the label lands over the actual rendered pixel
      const canvasRect = canvas.getBoundingClientRect()
      const wrapRect   = wrap.getBoundingClientRect()
      const offsetX    = canvasRect.left - wrapRect.left
      const offsetY    = canvasRect.top  - wrapRect.top
      label.style.left    = (offsetX + p.x) + 'px'
      label.style.top     = (offsetY + p.y) + 'px'
      label.style.opacity = p.visible ? '1' : '0'
    }
    requestAnimationFrame(updateLabel)
  }
  requestAnimationFrame(updateLabel)

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
