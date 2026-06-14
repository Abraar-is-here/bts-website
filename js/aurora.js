/* ===========================================================================
   js/aurora.js
   ---------------------------------------------------------------------------
   Full-viewport animated aurora, rendered with a hand-written WebGL fragment
   shader. It draws a domain-warped fractal-noise field and remaps it through
   the BTS blue palette (navy -> deep royal -> electric royal -> sky), so the
   colour field itself morphs like liquid rather than a few blobs translating.

   This is the same technique the ruucm/shadergradient library uses internally;
   it's written natively here because that library is React/R3F-only and needs
   a bundler, which this plain-HTML / no-build site doesn't have.

   Behaviour:
     - On success, adds `webgl-active` to <html> so the CSS blob fallback in
       main.css stays hidden (the two never run at once).
     - If WebGL is missing or fails to compile, it bails out silently and the
       CSS fallback takes over.
     - Honours prefers-reduced-motion: renders one static frame, no loop.
     - Pauses the render loop when the tab is hidden (battery friendly).
   ========================================================================== */
(function () {
  'use strict';

  var canvas = document.getElementById('aurora-canvas');
  if (!canvas) return;

  // WebGL1 for the widest device support.
  var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  if (!gl) return; // -> CSS fallback shows automatically

  /* --- Shader sources ---------------------------------------------------- */

  // Vertex shader: just passes through a full-screen quad in clip space.
  var VERT = [
    'attribute vec2 a_pos;',
    'void main() {',
    '  gl_Position = vec4(a_pos, 0.0, 1.0);',
    '}'
  ].join('\n');

  // Fragment shader: 2D simplex noise -> fbm -> domain warp -> palette map.
  var FRAG = [
    'precision highp float;',
    'uniform float u_time;',
    'uniform vec2  u_resolution;',
    // Palette fed from CSS tokens (colors.css) at runtime — single source of truth.
    'uniform vec3  u_navy;',
    'uniform vec3  u_royalD;',
    'uniform vec3  u_royal;',
    'uniform vec3  u_sky;',

    // --- Ashima Arts 2D simplex noise -----------------------------------
    'vec3 mod289(vec3 x){return x - floor(x*(1.0/289.0))*289.0;}',
    'vec2 mod289(vec2 x){return x - floor(x*(1.0/289.0))*289.0;}',
    'vec3 permute(vec3 x){return mod289(((x*34.0)+1.0)*x);}',
    'float snoise(vec2 v){',
    '  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);',
    '  vec2 i  = floor(v + dot(v, C.yy));',
    '  vec2 x0 = v - i + dot(i, C.xx);',
    '  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);',
    '  vec4 x12 = x0.xyxy + C.xxzz;',
    '  x12.xy -= i1;',
    '  i = mod289(i);',
    '  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));',
    '  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);',
    '  m = m*m; m = m*m;',
    '  vec3 x = 2.0 * fract(p * C.www) - 1.0;',
    '  vec3 h = abs(x) - 0.5;',
    '  vec3 ox = floor(x + 0.5);',
    '  vec3 a0 = x - ox;',
    '  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);',
    '  vec3 g;',
    '  g.x  = a0.x  * x0.x  + h.x  * x0.y;',
    '  g.yz = a0.yz * x12.xz + h.yz * x12.yw;',
    '  return 130.0 * dot(m, g);',
    '}',

    // --- Fractal Brownian motion (2 octaves) ----------------------------
    // Only 2 octaves: the field stays smooth with almost no fine detail, so
    // we get a few large soft masses rather than marbling.
    'float fbm(vec2 p){',
    '  float v = 0.0;',
    '  float a = 0.5;',
    '  for (int i = 0; i < 2; i++) {',
    '    v += a * snoise(p);',
    '    p *= 2.0;',
    '    a *= 0.5;',
    '  }',
    '  return v;',
    '}',

    'void main(){',
    '  vec2 uv = gl_FragCoord.xy / u_resolution.xy;',
    '  vec2 p = uv;',
    '  p.x *= u_resolution.x / u_resolution.y;',   // aspect-correct
    // Large zoom (was 1.5): features are now several times the screen size,
    // so only a few giant soft masses are visible at once.
    '  p *= 0.28;',

    '  float t = u_time * 0.045;',                  // slow, sweeping flow

    // Gentle two-step domain warp. Amplitudes are small (was 4.0) and the
    // warp is sampled at the same low frequency as the field, so it softly
    // bends the big shapes instead of marbling them.
    '  vec2 q = vec2(fbm(p + vec2(0.0, t)),',
    '                fbm(p + vec2(3.2, 1.0 - t)));',
    '  vec2 r = vec2(fbm(p + 1.1*q + vec2(1.7, 9.2)),',
    '                fbm(p + 1.1*q + vec2(8.3, 2.8)));',
    '  float f = fbm(p + 1.3*r);',

    // Push the value range so the four colours each fill a broad zone.
    '  float n = clamp(f * 0.62 + 0.5, 0.0, 1.0);',

    // Four broad sweeping zones across the value range (navy -> sky).
    // Colours come from the u_* uniforms (set from the CSS tokens).
    '  vec3 col = u_navy;',
    '  col = mix(col, u_royalD, smoothstep(0.10, 0.42, n));',
    '  col = mix(col, u_royal,  smoothstep(0.38, 0.70, n));',
    '  col = mix(col, u_sky,    smoothstep(0.70, 0.96, n));',

    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  /* --- Compile / link helpers ------------------------------------------- */
  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      // Surface the reason in the console, then let the caller fall back.
      console.warn('[aurora] shader compile failed:', gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  var vs = compile(gl.VERTEX_SHADER, VERT);
  var fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return; // -> CSS fallback

  var prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn('[aurora] program link failed:', gl.getProgramInfoLog(prog));
    return;
  }
  gl.useProgram(prog);

  /* --- Palette from CSS tokens (single source of truth) ----------------- */
  // Read a CSS custom property (#rgb or #rrggbb) as a normalised [r,g,b] 0..1.
  // Editing colors.css now re-tints the shader automatically — no JS hex here.
  function cssRGB(name) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    var h = v.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  gl.uniform3fv(gl.getUniformLocation(prog, 'u_navy'),   cssRGB('--c-navy'));
  gl.uniform3fv(gl.getUniformLocation(prog, 'u_royalD'), cssRGB('--c-royal-deep'));
  gl.uniform3fv(gl.getUniformLocation(prog, 'u_royal'),  cssRGB('--c-royal'));
  gl.uniform3fv(gl.getUniformLocation(prog, 'u_sky'),    cssRGB('--c-sky'));

  /* --- Full-screen quad (two triangles) --------------------------------- */
  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,  1, -1,  -1, 1,
    -1,  1,  1, -1,   1, 1
  ]), gl.STATIC_DRAW);

  var aPos = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  var uTime = gl.getUniformLocation(prog, 'u_time');
  var uRes = gl.getUniformLocation(prog, 'u_resolution');

  // We got this far: WebGL is live. Hide the CSS fallback.
  document.documentElement.classList.add('webgl-active');

  /* --- Sizing ----------------------------------------------------------- */
  // Cap pixel ratio: this is a soft, full-screen background, so there's no
  // need to pay for retina-density fragments on such a heavy shader.
  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var w = Math.floor(canvas.clientWidth * dpr);
    var h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
    gl.uniform2f(uRes, w, h);
  }

  /* --- Render loop ------------------------------------------------------ */
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var rafId = null;
  var start = performance.now();

  function draw(now) {
    resize();
    var t = (now - start) * 0.001; // seconds
    gl.uniform1f(uTime, t);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    rafId = requestAnimationFrame(draw);
  }

  function renderStatic() {
    resize();
    gl.uniform1f(uTime, 12.0); // a fixed, pleasant frame of the field
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function play() {
    if (reduceMotion.matches) { renderStatic(); return; }
    if (rafId === null) {
      start = performance.now();
      rafId = requestAnimationFrame(draw);
    }
  }
  function stop() {
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  }

  // Pause when the tab isn't visible.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop();
    else play();
  });

  // React if the user toggles reduced-motion at the OS level.
  (reduceMotion.addEventListener
    ? reduceMotion.addEventListener.bind(reduceMotion, 'change')
    : reduceMotion.addListener.bind(reduceMotion))(function () {
      stop();
      play();
    });

  window.addEventListener('resize', function () {
    // On a static (reduced-motion) render we must redraw on resize.
    if (reduceMotion.matches) renderStatic();
  });

  play();
})();
