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
  })

  const wrap = canvas.parentElement
  if (wrap && getComputedStyle(wrap).position === 'static') {
    wrap.style.position = 'relative'
  }
  wrap?.appendChild(label)

  /* ── 3D → 2D projection ─────────────────────────────────────────────────── */
  // cobe's internal 3D coordinate system (matches its GLSL source):
  //   x3 = cos(lat) * cos(lon)   ← toward viewer at lon=0, phi=0
  //   y3 = sin(lat)               ← up
  //   z3 = cos(lat) * sin(lon)   ← east (lon=90° E)
  //
  // Phi rotation around Y axis (right-hand, increasing phi → moves prime
  // meridian leftward on screen → we see more of the eastern hemisphere):
  //   xr = cos(phi)*x3 - sin(phi)*z3   ← screen-x
  //   zr = sin(phi)*x3 + cos(phi)*z3   ← depth (positive = toward viewer)
  //
  // Theta rotation around X axis (theta > 0 tilts north pole toward viewer):
  //   yr = cos(theta)*y3 - sin(theta)*zr
  //   zf = sin(theta)*y3 + cos(theta)*zr
  //
  // Screen: screenX = r + xr*r,  screenY = r - yr*r,  visible: zf > 0
  function project (latDeg, lonDeg, curPhi, curTheta, size) {
    const lat    = latDeg * Math.PI / 180
    const lon    = lonDeg * Math.PI / 180
    const cosLat = Math.cos(lat)

    const x3 = cosLat * Math.cos(lon)
    const y3 = Math.sin(lat)
    const z3 = cosLat * Math.sin(lon)

    // Rotate by phi around Y axis
    const cosPhi = Math.cos(curPhi)
    const sinPhi = Math.sin(curPhi)
    const xr = cosPhi * x3 - sinPhi * z3
    const zr = sinPhi * x3 + cosPhi * z3

    // Rotate by theta around X axis
    const cosT = Math.cos(curTheta)
    const sinT = Math.sin(curTheta)
    const yr = cosT * y3 - sinT * zr
    const zf = sinT * y3 + cosT * zr

    const r = size / 2
    return {
      x:       r + xr * r,
      y:       r - yr * r,
      visible: zf > 0,
    }
  }

  // Label is pinned at (left:0, top:0) and moved purely by transform so that
  // no containing-block offset can throw off the coordinates.
  label.style.left = '0'
  label.style.top  = '0'

  function updateLabel () {
    const size = canvas.offsetWidth
    if (size > 0) {
      const p = project(BRISTOL_LAT, BRISTOL_LON, livePhi, liveTheta, size)
      label.style.transform = 'translate(calc(' + p.x + 'px - 50%), calc(' + p.y + 'px - 100% - 10px))'
      label.style.opacity   = p.visible ? '1' : '0'
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
