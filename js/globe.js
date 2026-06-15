/* ===========================================================================
   js/globe.js
   ---------------------------------------------------------------------------
   Interactive dot-matrix globe drawn on a plain 2D canvas (no libraries).

   How it works:
     1. Evenly scatter points over a unit sphere (Fibonacci spiral).
     2. Keep only the points that fall on land, tested against a small set of
        continent polygons in lon/lat space -> continents are "picked out by
        dot density", oceans are empty.
     3. Each frame: rotate around the vertical (Y) axis by `spin`, apply an
        axial tilt around the X axis by `tilt`, orthographically project, and
        draw a small plus/cross glyph at every point. Front-facing dots are
        bright (navy -> royal); back-facing dots are dim slate, so the sphere
        reads with depth.

   Interaction (added):
     - Drag to rotate (horizontal = spin, vertical = tilt) via Pointer Events,
       with pointer capture so the drag survives leaving the canvas.
     - Release imparts momentum that decays with friction (flick-to-spin).
     - Vertical tilt is clamped, then eases back to the designed axial rest.
     - Auto-spin resumes after a short idle once the user lets go.
     - Keyboard: focus the globe and use the arrow keys to rotate it.

   Respects prefers-reduced-motion (no auto-spin / no momentum loop; the user
   can still drag, and the globe gently settles afterwards).
   ========================================================================== */
(function () {
  'use strict';

  var canvas = document.getElementById('globe-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var DEG = Math.PI / 180;

  /* --- Palette from CSS tokens (single source of truth, see colors.css) -- */
  function cssRGB(name) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    var h = v.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  var NAVY = cssRGB('--c-navy');     // far front dots
  var ROYAL = cssRGB('--c-royal');   // near front dots
  var SLATE = cssRGB('--c-slate');   // back (far-side) dots

  /* --- Continent outlines (approximate), as [lon, lat] polygons ---------- *
   * Coarse but recognisable; enough to read as Earth on a small globe.      */
  var CONTINENTS = [
    // North America
    [[-158,68],[-120,70],[-92,72],[-78,67],[-60,58],[-55,50],[-66,46],[-70,40],
     [-76,33],[-82,26],[-92,18],[-98,16],[-106,23],[-114,28],[-124,40],[-124,48],
     [-130,54],[-140,60],[-150,62],[-158,68]],
    // Central America isthmus
    [[-92,18],[-83,8],[-77,8],[-82,15],[-92,18]],
    // South America
    [[-78,8],[-72,10],[-60,5],[-50,0],[-44,-3],[-35,-7],[-38,-15],[-48,-25],
     [-58,-35],[-64,-42],[-66,-50],[-72,-52],[-74,-44],[-72,-32],[-70,-20],
     [-76,-12],[-80,-4],[-78,8]],
    // Greenland
    [[-46,60],[-30,60],[-20,70],[-22,78],[-34,82],[-48,80],[-54,72],[-50,64],[-46,60]],
    // Europe
    [[-10,37],[-9,43],[-2,48],[2,51],[-4,58],[5,62],[12,66],[24,66],[30,60],
     [40,58],[48,52],[40,46],[28,45],[20,40],[12,38],[3,42],[-6,37],[-10,37]],
    // UK
    [[-6,50],[-2,50],[0,53],[-2,58],[-6,58],[-8,54],[-6,50]],
    // Africa
    [[-16,28],[-10,32],[10,34],[24,32],[34,30],[44,12],[52,12],[48,2],[42,-12],
     [38,-22],[28,-34],[20,-35],[12,-18],[8,4],[-8,5],[-16,16],[-17,22],[-16,28]],
    // Madagascar
    [[44,-16],[48,-16],[50,-22],[47,-25],[44,-22],[44,-16]],
    // Asia (Russia, Middle East, India, China, SE Asia)
    [[28,46],[40,48],[55,52],[70,55],[88,60],[105,62],[120,62],[140,68],[160,68],
     [170,66],[178,62],[160,55],[145,50],[140,42],[130,35],[122,30],[120,22],
     [108,16],[100,8],[96,16],[92,22],[88,22],[80,8],[77,8],[73,18],[66,24],
     [58,24],[50,28],[44,36],[36,38],[30,40],[28,46]],
    // Japan
    [[131,32],[136,34],[141,38],[143,43],[140,42],[135,36],[131,33],[131,32]],
    // Indonesia / Malay archipelago
    [[96,-2],[110,-6],[120,-4],[132,-3],[140,-4],[134,-8],[118,-9],[104,-8],[96,-2]],
    // Australia
    [[114,-22],[122,-18],[130,-12],[137,-12],[143,-12],[147,-20],[153,-28],
     [150,-37],[140,-38],[130,-32],[120,-34],[114,-30],[112,-26],[114,-22]],
    // New Zealand
    [[167,-44],[171,-41],[174,-37],[176,-40],[173,-46],[168,-47],[167,-44]]
  ];

  // Standard ray-casting point-in-polygon test (lon = x, lat = y).
  function inPoly(lon, lat, poly) {
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][0], yi = poly[i][1];
      var xj = poly[j][0], yj = poly[j][1];
      var hit = ((yi > lat) !== (yj > lat)) &&
                (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi);
      if (hit) inside = !inside;
    }
    return inside;
  }
  function isLand(lon, lat) {
    for (var k = 0; k < CONTINENTS.length; k++) {
      if (inPoly(lon, lat, CONTINENTS[k])) return true;
    }
    return false;
  }

  /* --- Build the land-point cloud once (Fibonacci sphere) ---------------- */
  var POINTS = (function () {
    var pts = [];
    var N = 2600;                       // sample density
    var golden = Math.PI * (3 - Math.sqrt(5));
    for (var i = 0; i < N; i++) {
      var y = 1 - (i / (N - 1)) * 2;    // 1 -> -1
      var rad = Math.sqrt(1 - y * y);
      var theta = golden * i;
      var x = Math.cos(theta) * rad;
      var z = Math.sin(theta) * rad;

      var lat = Math.asin(y) / DEG;
      // lon = atan2(x, z): puts the prime meridian toward the viewer and makes
      // east increase to the RIGHT (atan2(z,x) renders the map mirrored).
      var lon = Math.atan2(x, z) / DEG;
      if (isLand(lon, lat)) pts.push([x, y, z]);
    }
    return pts;
  })();

  /* --- Axial tilt: -20deg is the designed resting presentation ----------- */
  var BASE_TILT = -20 * DEG;
  var MAX_TILT = 78 * DEG;              // clamp so the poles never fully flip

  /* --- Sizing ------------------------------------------------------------ */
  var cx = 0, cy = 0, R = 0, dpr = 1, cssSize = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cssSize = canvas.clientWidth || 1;       // square element (CSS aspect-ratio)
    canvas.width = Math.floor(cssSize * dpr);
    canvas.height = Math.floor(cssSize * dpr);
    cx = canvas.width / 2;
    cy = canvas.height / 2;
    R = canvas.width * 0.40;                  // sphere radius in device px
  }

  /* --- Draw one frame at rotation `spin` (Y) and `tilt` (X) -------------- */
  function render(spin, tilt) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var cosA = Math.cos(spin), sinA = Math.sin(spin);
    var cosT = Math.cos(tilt), sinT = Math.sin(tilt);
    var glyph = Math.max(1.1, R * 0.018);    // half-length of each plus stroke
    var lw = Math.max(1, dpr);
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';

    for (var i = 0; i < POINTS.length; i++) {
      var x = POINTS[i][0], y = POINTS[i][1], z = POINTS[i][2];

      // Spin around the vertical (Y) axis.
      var x1 = x * cosA + z * sinA;
      var z1 = -x * sinA + z * cosA;
      // Apply axial tilt around the X axis.
      var y2 = y * cosT - z1 * sinT;
      var z2 = y * sinT + z1 * cosT;

      var sx = cx + x1 * R;
      var sy = cy - y2 * R;
      var front = z2 > 0;                     // facing the camera (+z)

      // Depth shading for the light panel: front dots interpolate navy ->
      // electric royal toward the near pole; back dots a faint slate so they
      // recede. All three colours come from the CSS tokens (NAVY/ROYAL/SLATE).
      var depth = (z2 + 1) / 2;               // 0 (far) .. 1 (near)
      var g, alpha;
      if (front) {
        var t = depth;
        var rr = Math.round(NAVY[0] + (ROYAL[0] - NAVY[0]) * t);
        var gg = Math.round(NAVY[1] + (ROYAL[1] - NAVY[1]) * t);
        var bb = Math.round(NAVY[2] + (ROYAL[2] - NAVY[2]) * t);
        g = 'rgba(' + rr + ',' + gg + ',' + bb + ',';
        alpha = 0.55 + 0.45 * t;
      } else {
        g = 'rgba(' + SLATE[0] + ',' + SLATE[1] + ',' + SLATE[2] + ',';
        alpha = 0.18 + 0.18 * depth;
      }

      var s = glyph * (0.6 + 0.4 * depth);     // near dots a touch larger
      ctx.strokeStyle = g + alpha + ')';
      ctx.beginPath();
      ctx.moveTo(sx - s, sy);
      ctx.lineTo(sx + s, sy);
      ctx.moveTo(sx, sy - s);
      ctx.lineTo(sx, sy + s);
      ctx.stroke();
    }
  }

  /* --- Debug: flat equirectangular render of the land mask ---------------- *
   * Append ?globe=flat to the URL to draw the continents as a flat world map
   * (east to the right, north up) so the mask can be verified independently of
   * the sphere projection. Dev-only; off by default.                         */
  var DEBUG_FLAT = new URLSearchParams(location.search).get('globe') === 'flat';
  function renderFlat() {
    resize();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(' + ROYAL[0] + ',' + ROYAL[1] + ',' + ROYAL[2] + ',0.9)';
    var step = 1.2;
    for (var lon = -180; lon <= 180; lon += step) {
      for (var lat = 90; lat >= -90; lat -= step) {
        if (!isLand(lon, lat)) continue;
        var sx = (lon + 180) / 360 * canvas.width;
        var sy = (90 - lat) / 180 * canvas.height;
        ctx.fillRect(sx, sy, 2, 2);
      }
    }
  }

  /* --- Motion state ------------------------------------------------------ */
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var PERIOD = 30000;                          // ms per full auto turn (~30s)
  var AUTO_SPEED = (Math.PI * 2) / PERIOD;     // rad/ms, the idle spin rate
  var IDLE_RESUME = 2600;                       // ms after release before auto-spin
  var FRICTION = 0.94;                          // per-60fps-frame momentum decay

  // 'auto'  : idle spin (eased toward AUTO_SPEED), tilt eases back to BASE_TILT
  // 'drag'  : the pointer/keys drive spin & tilt directly
  // 'coast' : released with momentum, decaying under friction
  var mode = 'auto';
  var spin = -0.4;                             // pleasant starting longitude
  var tilt = BASE_TILT;
  var spinVel = AUTO_SPEED;                     // rad/ms
  var tiltVel = 0;
  var idleUntilAuto = 0;

  var dragging = false;
  var activePointer = null;
  var lastX = 0, lastY = 0, lastMoveT = 0;

  var rafId = null;
  var lastFrameT = 0;

  function clampTilt(v) {
    var lo = BASE_TILT - MAX_TILT, hi = BASE_TILT + MAX_TILT;
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function frame(now) {
    var dt = Math.min(now - lastFrameT, 50);   // clamp long gaps (tab switch)
    lastFrameT = now;
    var decay = Math.pow(FRICTION, dt / 16.67);

    if (mode === 'coast') {
      spinVel *= decay;
      tiltVel *= decay;
      spin += spinVel * dt;
      tilt = clampTilt(tilt + tiltVel * dt);
      // Once the flick has bled off and the idle delay has passed, hand back
      // to the idle spin. ease-out feel: it never hard-stops.
      if (now >= idleUntilAuto && Math.abs(spinVel) <= AUTO_SPEED) {
        mode = 'auto';
      }
    } else if (mode === 'auto') {
      var target = reduceMotion.matches ? 0 : AUTO_SPEED;
      spinVel += (target - spinVel) * 0.03;    // ease toward the idle rate
      spin += spinVel * dt;
      tilt += (BASE_TILT - tilt) * 0.05;       // settle back to the axial rest
    }
    // 'drag' updates spin/tilt in the move handler; here we just paint.

    render(spin, tilt);
    rafId = requestAnimationFrame(frame);
  }

  function startLoop() {
    if (rafId !== null) return;
    lastFrameT = performance.now();
    rafId = requestAnimationFrame(frame);
  }
  function stopLoop() {
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  }

  /* --- Pointer drag ------------------------------------------------------ */
  function onPointerDown(e) {
    if (dragging) return;                       // ignore extra fingers
    dragging = true;
    activePointer = e.pointerId;
    if (canvas.setPointerCapture) {
      try { canvas.setPointerCapture(activePointer); } catch (err) {}
    }
    canvas.classList.add('is-grabbing');
    mode = 'drag';
    spinVel = 0; tiltVel = 0;
    lastX = e.clientX; lastY = e.clientY;
    lastMoveT = performance.now();
    startLoop();                                // ensure painting even if paused
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!dragging || e.pointerId !== activePointer) return;
    var now = performance.now();
    var dx = e.clientX - lastX;
    var dy = e.clientY - lastY;
    var k = (Math.PI * 2) / cssSize;            // drag the full width ~= one turn
    var dSpin = dx * k;
    var dTilt = dy * k;
    spin += dSpin;
    tilt = clampTilt(tilt + dTilt);
    var dtm = Math.max(now - lastMoveT, 1);     // velocity for the release flick
    spinVel = dSpin / dtm;
    tiltVel = dTilt / dtm;
    lastX = e.clientX; lastY = e.clientY; lastMoveT = now;
    render(spin, tilt);
    e.preventDefault();
  }

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    if (activePointer !== null && canvas.releasePointerCapture &&
        canvas.hasPointerCapture && canvas.hasPointerCapture(activePointer)) {
      try { canvas.releasePointerCapture(activePointer); } catch (err) {}
    }
    activePointer = null;
    canvas.classList.remove('is-grabbing');
    // If the pointer went stale (no recent move), drop stored velocity so the
    // globe doesn't lurch from an old reading.
    if (performance.now() - lastMoveT > 90) { spinVel = 0; tiltVel = 0; }
    mode = 'coast';
    idleUntilAuto = performance.now() + IDLE_RESUME;
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  /* --- Keyboard (accessible rotation when the globe is focused) ---------- */
  var KEY_STEP = 12 * DEG;
  canvas.addEventListener('keydown', function (e) {
    var handled = true;
    switch (e.key) {
      case 'ArrowLeft':  spin -= KEY_STEP; break;
      case 'ArrowRight': spin += KEY_STEP; break;
      case 'ArrowUp':    tilt = clampTilt(tilt - KEY_STEP); break;
      case 'ArrowDown':  tilt = clampTilt(tilt + KEY_STEP); break;
      default: handled = false;
    }
    if (!handled) return;
    e.preventDefault();
    spinVel = 0; tiltVel = 0;
    mode = 'coast';
    idleUntilAuto = performance.now() + IDLE_RESUME;
    startLoop();
    render(spin, tilt);
  });

  /* --- Lifecycle: pause off-screen and when the tab is hidden ------------ */
  function play() {
    resize();
    if (DEBUG_FLAT) { renderFlat(); return; }
    render(spin, tilt);
    // Even under reduced motion we keep a light loop so drag/keys animate;
    // it settles to a stop because AUTO_SPEED targets 0 in that mode.
    startLoop();
  }
  function pause() {
    if (dragging) return;                       // never pause mid-drag
    stopLoop();
  }

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) play();
      else pause();
    }, { threshold: 0.05 });
    io.observe(canvas);
  } else {
    play();
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) pause(); else play();
  });
  window.addEventListener('resize', function () {
    resize();
    render(spin, tilt);
  });
  (reduceMotion.addEventListener
    ? reduceMotion.addEventListener.bind(reduceMotion, 'change')
    : reduceMotion.addListener.bind(reduceMotion))(function () {
      // Re-evaluate the idle target on the next frame; just make sure we paint.
      startLoop();
    });
})();
