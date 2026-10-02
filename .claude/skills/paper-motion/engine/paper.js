/* paper-motion engine core.
 *
 * PM.init(storyboard) builds the whole video as DOM once. PM.setTime(t) then sets every
 * style from the time alone, so any frame can be rendered in any order (deterministic).
 * Elements live in props.js and register themselves in PM.builders.
 */
(function () {
  'use strict';
  const PM = (window.PM = { builders: {}, themes: {}, ready: false });

  // ------------------------------------------------------------------ math
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  function hash(s) {
    s = String(s);
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function rng(seed) {
    let s = (typeof seed === 'number' ? seed : hash(seed)) >>> 0 || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }
  const outBounce = (t) => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  };
  const E = {
    linear: (t) => t,
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inCubic: (t) => t * t * t,
    inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    outElastic: (t) => (t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1),
    outBounce,
    spring: (t) => (t >= 1 ? 1 : 1 - Math.exp(-7 * t) * Math.cos(14 * t)),
    step: (t) => (t >= 1 ? 1 : 0),
  };
  PM.E = E;
  PM.util = { clamp, lerp, hash, rng };

  /** number | [[t, v, ease?], ...] -> value at t. Ease on a key applies to the segment ending at it. */
  function val(spec, t, def) {
    if (spec === undefined || spec === null) return def;
    if (typeof spec === 'number') return spec;
    if (Array.isArray(spec) && spec.length && Array.isArray(spec[0])) {
      if (t <= spec[0][0]) return spec[0][1];
      for (let i = 1; i < spec.length; i++) {
        if (t <= spec[i][0]) {
          const a = spec[i - 1], b = spec[i];
          const p = (t - a[0]) / (b[0] - a[0] || 1e-9);
          return lerp(a[1], b[1], (E[b[2]] || E.inOutCubic)(clamp(p)));
        }
      }
      return spec[spec.length - 1][1];
    }
    return def;
  }
  PM.val = val;

  // ------------------------------------------------------------------ DOM helpers
  function div(cls, style) {
    const d = document.createElement('div');
    if (cls) d.className = cls;
    if (style) Object.assign(d.style, style);
    return d;
  }
  PM.div = div;

  // ------------------------------------------------------------------ textures
  const texCache = {};
  function tex(kind) {
    if (texCache[kind]) return texCache[kind];
    const size = 256;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const r = rng('tex-' + kind);
    const noise = (base, amp, tint) => {
      g.fillStyle = base; g.fillRect(0, 0, size, size);
      const im = g.getImageData(0, 0, size, size), d = im.data;
      for (let i = 0; i < d.length; i += 4) {
        const n = (r() - 0.5) * amp;
        d[i] += n * tint[0]; d[i + 1] += n * tint[1]; d[i + 2] += n * tint[2];
      }
      g.putImageData(im, 0, 0);
    };
    const fibres = (n, light, dark, len) => {
      g.lineWidth = 0.7;
      for (let i = 0; i < n; i++) {
        const x = r() * size, y = r() * size, a = r() * Math.PI * 2, l = len[0] + r() * (len[1] - len[0]);
        g.strokeStyle = r() < 0.5 ? light : dark;
        for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
          g.beginPath();
          g.moveTo(x + ox, y + oy);
          g.quadraticCurveTo(x + ox + Math.cos(a + 0.6) * l / 2, y + oy + Math.sin(a + 0.6) * l / 2, x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l);
          g.stroke();
        }
      }
    };
    if (kind === 'paper') {
      noise('rgb(236,236,234)', 26, [1, 1, 1]);
      fibres(300, 'rgba(255,255,255,.55)', 'rgba(110,95,80,.20)', [5, 18]);
      // soft mottling so flat colours never look digital
      for (let i = 0; i < 14; i++) {
        const x = r() * size, y = r() * size, rad = 30 + r() * 60;
        const gr = g.createRadialGradient(x, y, 0, x, y, rad);
        const dark = r() < 0.5;
        gr.addColorStop(0, dark ? 'rgba(120,110,100,.10)' : 'rgba(255,255,255,.14)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(0, 0, size, size);
      }
    } else if (kind === 'cork') {
      noise('rgb(214,168,118)', 34, [1, 0.9, 0.7]);
      for (let i = 0; i < 380; i++) {
        const x = r() * size, y = r() * size, rr = 0.8 + r() * 3.2;
        g.fillStyle = r() < 0.55 ? 'rgba(120,76,38,.45)' : 'rgba(250,214,160,.5)';
        for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
          g.beginPath(); g.ellipse(x + ox, y + oy, rr * (0.7 + r() * 0.6), rr, r() * 3, 0, Math.PI * 2); g.fill();
        }
      }
    } else if (kind === 'wood') {
      noise('rgb(150,100,64)', 18, [1, 0.8, 0.6]);
      g.lineWidth = 1;
      for (let i = 0; i < 70; i++) {
        const y = r() * size;
        g.strokeStyle = r() < 0.5 ? 'rgba(70,40,20,.28)' : 'rgba(210,160,110,.22)';
        g.beginPath(); g.moveTo(0, y);
        for (let x = 0; x <= size; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + i) * 2.2);
        g.stroke();
      }
    } else if (kind === 'card') {
      noise('rgb(205,170,125)', 22, [1, 0.9, 0.7]);
      g.strokeStyle = 'rgba(110,75,40,.22)'; g.lineWidth = 2;
      for (let y = 0; y < size; y += 7) { g.beginPath(); g.moveTo(0, y); g.lineTo(size, y); g.stroke(); }
    } else {
      noise('rgb(240,240,240)', 14, [1, 1, 1]);
    }
    return (texCache[kind] = 'url(' + c.toDataURL('image/png') + ')');
  }
  PM.tex = tex;

  // ------------------------------------------------------------------ paper pieces
  /** Hand-cut polygon: edge points nudged by a few px. Returns CSS polygon(). */
  function cutPoly(w, h, j, seed, torn) {
    const r = rng(seed);
    const amp = torn || [j, j, j, j]; // top, right, bottom, left
    const pts = [];
    const jit = (a) => (r() - 0.5) * 2 * a;
    const step = torn ? 14 : 46;
    const nx = Math.max(1, Math.round(w / step)), ny = Math.max(1, Math.round(h / step));
    for (let i = 0; i <= nx; i++) pts.push([clamp(i / nx * w + (i && i < nx ? jit(2) : 0), 0, w), Math.max(0, jit(amp[0]) + amp[0])]);
    for (let i = 1; i <= ny; i++) pts.push([w - Math.max(0, jit(amp[1]) + amp[1]), clamp(i / ny * h, 0, h)]);
    for (let i = nx - 1; i >= 0; i--) pts.push([clamp(i / nx * w, 0, w), h - Math.max(0, jit(amp[2]) + amp[2])]);
    for (let i = ny - 1; i > 0; i--) pts.push([Math.max(0, jit(amp[3]) + amp[3]), clamp(i / ny * h, 0, h)]);
    return 'polygon(' + pts.map((p) => p[0].toFixed(1) + 'px ' + p[1].toFixed(1) + 'px').join(',') + ')';
  }
  PM.cutPoly = cutPoly;

  /**
   * A paper cut-out. Wrapper carries the drop shadow, `.cut` carries the clipped coloured paper.
   * o: {w,h,x,y,rot,color,tex,edge:'cut'|'round'|'circle'|'torn'|'none',radius,j,poly,shadow,seed,origin}
   */
  function piece(o) {
    const w = o.w, h = o.h;
    const wrap = div('piece');
    wrap.style.left = (o.x || 0) + 'px';
    wrap.style.top = (o.y || 0) + 'px';
    wrap.style.width = w + 'px';
    wrap.style.height = h + 'px';
    if (o.rot) wrap.style.transform = 'rotate(' + o.rot + 'deg)';
    if (o.origin) wrap.style.transformOrigin = o.origin;
    if (o.shadow !== false) {
      const s = o.shadow === 'soft' ? 'drop-shadow(0 6px 10px rgba(0,0,0,.35))' : 'drop-shadow(2px 4px 3px rgba(0,0,0,.34))';
      wrap.style.filter = s;
    }
    const cut = div('cut');
    cut.style.backgroundColor = o.color || '#fff';
    cut.style.backgroundImage = tex(o.tex || 'paper');
    cut.style.backgroundBlendMode = 'multiply';
    cut.style.backgroundSize = '256px 256px';
    const edge = o.edge || 'cut';
    if (edge === 'cut') cut.style.clipPath = o.poly || cutPoly(w, h, o.j == null ? 1.4 : o.j, o.seed || (w * 31 + h));
    else if (edge === 'torn') cut.style.clipPath = cutPoly(w, h, 2, o.seed || (w * 17 + h), o.torn || [2.5, 1.2, 2.5, 1.2]);
    else if (edge === 'round') cut.style.borderRadius = typeof o.radius === 'string' ? o.radius : (o.radius == null ? 10 : o.radius) + 'px';
    else if (edge === 'circle') cut.style.borderRadius = '50%';
    else if (edge === 'poly') cut.style.clipPath = o.poly;
    if (o.bevel !== false) {
      cut.style.boxShadow = 'inset 2px 2px 0 rgba(255,255,255,.16), inset -2px -3px 0 rgba(0,0,0,.13)';
    }
    wrap.appendChild(cut);
    wrap._cut = cut;
    return wrap;
  }
  PM.piece = piece;

  const _measureHost = (() => { const d = div('', { position: 'absolute', left: '-9999px', top: '0', visibility: 'hidden' }); return d; })();
  function measure(node) {
    document.body.appendChild(_measureHost);
    _measureHost.appendChild(node);
    const r = { w: node.offsetWidth, h: node.offsetHeight };
    _measureHost.removeChild(node);
    return r;
  }
  PM.measure = measure;

  // ------------------------------------------------------------------ themes
  Object.assign(PM.themes, {
    teal:    { bg: '#6E9CA5', blot: ['#8FB8BE', '#5C8791'], floor: '#9A693D', floorTop: '#B58250' },
    navy:    { bg: '#1F2C55', blot: ['#2C3C70', '#141D3E'], floor: '#222A3C', floorTop: '#323B52' },
    night:   { bg: '#0F1637', blot: ['#1A2451', '#0A0F28'], floor: '#161D3A', floorTop: '#252E55' },
    dusk:    { bg: '#3C2A66', blot: ['#5A3F8F', '#2A1B4B'], floor: '#2B2150', floorTop: '#3C3068' },
    rust:    { bg: '#C5622E', blot: ['#DB7C45', '#A94E20'], floor: '#7C4A26', floorTop: '#95603A' },
    cream:   { bg: '#D9CEB9', blot: ['#E8DFCC', '#C7B99F'], floor: '#8F6C47', floorTop: '#A98259' },
    sage:    { bg: '#8FA58A', blot: ['#A6BBA1', '#7A9275'], floor: '#8A6845', floorTop: '#A27D58' },
    mustard: { bg: '#D6A23A', blot: ['#E6B957', '#BC8826'], floor: '#8A5A33', floorTop: '#A37048' },
    plum:    { bg: '#7A3E5C', blot: ['#9A5578', '#5F2D46'], floor: '#4B2538', floorTop: '#63364D' },
    stone:   { bg: '#BDB6A8', blot: ['#CFC9BC', '#A9A194'], floor: '#847560', floorTop: '#9C8B74' },
  });

  // ------------------------------------------------------------------ init
  let S, stage, scenes, groups, capsRoot, reviewEl;

  function normalize(sb) {
    const o = Object.assign({ width: 720, height: 1280, fps: 30, floorY: 960, captionY: 1004, boil: true, lang: 'en', maxWords: 3, themes: {}, style: {} }, sb);
    o.scenes = (sb.scenes || []).map((s, i) => Object.assign({ dur: 4, transition: i === 0 ? 'cut' : 'slide' }, s));
    let t = 0;
    for (const s of o.scenes) { s.start = t; t += s.dur; }
    o.duration = t;
    return o;
  }

  function themeOf(sc) {
    const base = PM.themes[sc.theme || 'teal'] || S.themes[sc.theme];
    const custom = Object.assign({}, base, S.themes[sc.theme] || {}, typeof sc.theme === 'object' ? sc.theme : {});
    return custom;
  }

  function buildBackdrop(root, th, sc) {
    const r = rng('bg-' + (sc.start || 0));
    const blobs = [];
    for (let i = 0; i < 9; i++) {
      const c = th.blot ? th.blot[i % th.blot.length] : th.bg;
      blobs.push('radial-gradient(' + Math.round(180 + r() * 320) + 'px ' + Math.round(180 + r() * 320) + 'px at ' + Math.round(r() * 100) + '% ' + Math.round(r() * 100) + '%,' + c + '99,transparent 70%)');
    }
    const bg = div('bg');
    bg.style.backgroundColor = th.bg;
    bg.style.backgroundImage = blobs.join(',') + ',' + tex('paper');
    bg.style.backgroundBlendMode = 'normal,normal,normal,normal,normal,normal,normal,normal,normal,multiply';
    bg.style.backgroundSize = 'auto,auto,auto,auto,auto,auto,auto,auto,auto,256px 256px';
    root.appendChild(bg);
  }

  function buildFloor(root, th, sc) {
    if (sc.floor === false) return;
    const y = sc.floorY != null ? sc.floorY : S.floorY;
    const fl = div('floor');
    fl.style.top = y + 'px';
    fl.style.height = S.height - y + 'px';
    fl.style.backgroundColor = th.floor;
    fl.style.backgroundImage = 'linear-gradient(to bottom,rgba(0,0,0,.0),rgba(0,0,0,.22)),' + tex(th.floorTex || 'paper');
    fl.style.backgroundBlendMode = 'normal,multiply';
    fl.style.backgroundSize = 'auto,256px 256px';
    fl.style.boxShadow = '0 -6px 14px rgba(0,0,0,.28)';
    const edge = div('floor-edge');
    edge.style.top = '0';
    edge.style.background = th.floorTop;
    edge.style.height = '7px';
    fl.appendChild(edge);
    root.appendChild(fl);
  }

  // ---- element motion ----
  const IN = {
    none: () => ({}),
    fade: (p) => ({ o: p }),
    pop: (p) => ({ s: E.outBack(p), o: clamp(p * 5), r: (1 - E.outBack(p)) * -8 }),
    grow: (p) => ({ s: E.outCubic(p), o: clamp(p * 6) }),
    flip: (p) => ({ sx: E.outBack(p), o: clamp(p * 6) }),
    rise: (p) => ({ dy: (1 - E.outBack(p)) * 260, o: clamp(p * 5) }),
    drop: (p) => ({ dy: -(1 - E.outBounce(p)) * 900, o: clamp(p * 8) }),
    slideL: (p, d) => ({ dx: -(1 - E.outBack(p)) * d, o: clamp(p * 6) }),
    slideR: (p, d) => ({ dx: (1 - E.outBack(p)) * d, o: clamp(p * 6) }),
    slideU: (p, d) => ({ dy: -(1 - E.outBack(p)) * d, o: clamp(p * 6) }),
    slideD: (p, d) => ({ dy: (1 - E.outBack(p)) * d, o: clamp(p * 6) }),
    slam: (p, d, after) => ({
      s: 1 + (1 - E.outCubic(p)) * 1.5, o: clamp(p * 10), r: (1 - p) * 10,
      dx: after > 0 ? Math.sin(after * 90) * 7 * Math.exp(-after * 16) : 0,
      dy: after > 0 ? Math.cos(after * 70) * 5 * Math.exp(-after * 16) : 0,
    }),
  };
  const IDLE = {
    bob:   (t, a, sp) => ({ dy: Math.sin(t * Math.PI * 2 * sp) * (a == null ? 5 : a) }),
    float: (t, a, sp) => ({ dy: Math.sin(t * Math.PI * 2 * sp * 0.6) * (a == null ? 10 : a), dx: Math.cos(t * Math.PI * 2 * sp * 0.4) * (a == null ? 10 : a) * 0.4 }),
    sway:  (t, a, sp) => ({ r: Math.sin(t * Math.PI * 2 * sp * 0.7) * (a == null ? 2.5 : a) }),
    wiggle:(t, a, sp) => ({ r: Math.sin(t * Math.PI * 2 * sp * 3) * (a == null ? 4 : a) }),
    pulse: (t, a, sp) => ({ s: 1 + Math.sin(t * Math.PI * 2 * sp) * (a == null ? 0.04 : a) }),
    hop:   (t, a, sp) => { const ph = (t * sp) % 1; const k = Math.sin(Math.PI * Math.min(1, ph * 1.6)); const air = ph * 1.6 < 1; return { dy: -k * (a == null ? 26 : a), sy: air ? 1 + k * 0.05 : 1 - Math.exp(-(ph - 0.625) * 22) * 0.07, sx: air ? 1 - k * 0.03 : 1 + Math.exp(-(ph - 0.625) * 22) * 0.05 }; },
    spin:  (t, a, sp) => ({ r: t * 360 * sp }),
    shake: (t, a, sp) => ({ dx: Math.sin(t * 60 * sp) * (a == null ? 3 : a) }),
  };

  function makeEl(spec, idx, scene) {
    const B = PM.builders[spec.type];
    if (!B) throw new Error('Unknown element type "' + spec.type + '". Known: ' + Object.keys(PM.builders).join(', '));
    const ctx = { S, E, val, rng, hash, div, piece, tex, measure, cutPoly, theme: scene.th, scene, idx };
    const built = B(spec, ctx);
    const el = div('el');
    el.style.zIndex = spec.z != null ? spec.z : idx;
    const body = div('body');
    body.style.width = built.w + 'px';
    body.style.height = built.h + 'px';
    const a = String(spec.anchor || built.anchor || 'c');
    const ax = a.includes('l') ? 0 : a.includes('r') ? 1 : 0.5;
    const ay = a.includes('t') ? 0 : a.includes('b') ? 1 : 0.5;
    body.style.left = -built.w * ax + 'px';
    body.style.top = -built.h * ay + 'px';
    body.appendChild(built.node);
    el.appendChild(body);
    return { spec, el, built, idx, seed: hash((spec.id || spec.type) + idx) };
  }

  function normAnim(a, dflt) {
    if (!a) return null;
    if (typeof a === 'string') a = { type: a };
    return Object.assign({ at: 0, dur: 0.45, from: 520 }, dflt, a);
  }

  function applyEl(it, lt) {
    const sp = it.spec;
    const inn = it._in || (it._in = normAnim(sp.in));
    const out = it._out || (it._out = normAnim(sp.out, { type: sp.in && sp.in.type ? sp.in.type : 'fade', dur: 0.3 }));
    let vis = true;
    if (inn && lt < inn.at) vis = false;
    if (out && lt >= out.at + out.dur) vis = false;
    if (sp.hidden) vis = false;
    if (!vis) { it.el.style.display = 'none'; return; }
    it.el.style.display = '';

    let x = val(sp.x, lt, S.width / 2), y = val(sp.y, lt, S.height / 2);
    let rot = val(sp.rot, lt, 0), sc = val(sp.scale, lt, 1), op = val(sp.opacity, lt, 1);
    let sx = 1, sy = 1;
    const add = (m) => {
      if (!m) return;
      if (m.dx) x += m.dx; if (m.dy) y += m.dy; if (m.r) rot += m.r;
      if (m.s != null) sc *= m.s; if (m.sx != null) sx *= m.sx; if (m.sy != null) sy *= m.sy;
      if (m.o != null) op *= m.o;
    };
    if (inn && lt < inn.at + inn.dur + 2) {
      const p = clamp((lt - inn.at) / inn.dur);
      add((IN[inn.type] || IN.pop)(p, inn.from, lt - (inn.at + inn.dur)));
    }
    if (out && lt >= out.at) {
      const p = 1 - clamp((lt - out.at) / out.dur);
      const m = (IN[out.type] || IN.fade)(p, out.from, 0);
      add(Object.assign({}, m, { o: m.o != null ? m.o : p }));
    }
    const bt = S.boil && !sp.still ? Math.floor(lt * 12) / 12 : lt;
    if (sp.idle) {
      const id = typeof sp.idle === 'string' ? { type: sp.idle } : sp.idle;
      const f = IDLE[id.type];
      if (f && (id.from == null || lt >= id.from) && (id.until == null || lt <= id.until)) {
        add(f(bt + (id.phase || 0) + it.seed % 7, id.amp, id.speed || 1));
      }
    }
    if (S.boil && !sp.still && !sp.noBoil) {
      const r = rng(it.seed + Math.floor(lt * 12) * 7919);
      x += (r() - 0.5) * 1.4; y += (r() - 0.5) * 1.4; rot += (r() - 0.5) * 0.7;
    }
    it.el.style.transform = 'translate(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px) rotate(' + rot.toFixed(3) + 'deg) scale(' + (sc * sx).toFixed(4) + ',' + (sc * sy).toFixed(4) + ')';
    it.el.style.opacity = op.toFixed(3);
    if (it.built.update) it.built.update(lt, { x, y, rot, sc, op });
  }

  // ---- banner ----
  function buildBanner(sc, th, text) {
    const root = div('banner');
    const strip = div('strip');
    const maxW = S.width - 90;
    strip.style.backgroundImage = tex('paper');
    strip.style.backgroundSize = '256px 256px';
    const span = document.createElement('span');
    span.style.unicodeBidi = 'plaintext';
    span.textContent = text;
    strip.appendChild(span);
    let size = (S.style.banner && S.style.banner.size) || 33;
    strip.style.fontSize = size + 'px';
    strip.style.padding = '0 34px';
    // measure single-line width and shrink to fit; wrap to 2 lines if still too wide
    strip.style.position = 'absolute';
    const probe = () => {
      const host = div('banner'); const c = strip.cloneNode(true);
      c.style.fontSize = size + 'px'; c.style.position = 'absolute'; c.style.whiteSpace = 'nowrap';
      host.appendChild(c); document.body.appendChild(_measureHost); _measureHost.appendChild(host);
      const w = c.offsetWidth; _measureHost.removeChild(host); return w;
    };
    while (probe() > maxW && size > 23) size -= 1;
    strip.style.fontSize = size + 'px';
    let w = Math.min(maxW, Math.max(probe(), S.bannerMinW || 540)), h = Math.round(size * 2.15);
    if (probe() > maxW) {
      strip.style.whiteSpace = 'normal'; strip.style.textAlign = 'center'; strip.style.lineHeight = '1.05';
      w = maxW; h = Math.round(size * 3.3); strip.style.fontSize = size + 'px';
    }
    strip.style.width = w + 'px';
    strip.style.height = h + 'px';
    strip.style.left = -w / 2 + 'px';
    strip.style.top = -h / 2 + 'px';
    const tz = (S.style.banner && S.style.banner.torn != null) ? S.style.banner.torn : 1;
    strip.style.clipPath = cutPoly(w, h, 2, hash(text), [2.6 * tz, 1.3 * tz, 2.6 * tz, 1.3 * tz]);
    const wrap = div('', { position: 'absolute', left: 0, top: 0, filter: 'drop-shadow(0 5px 5px rgba(0,0,0,.35))' });
    wrap.appendChild(strip);
    for (const side of [-1, 1]) {
      const tp = div('tape');
      tp.style.left = side * (w / 2) - 37 + side * 4 + 'px';
      tp.style.top = -h / 2 - 12 + 'px';
      tp.style.transform = 'rotate(' + side * 32 + 'deg)';
      tp.style.clipPath = 'polygon(0 12%,6% 0,12% 14%,18% 0,100% 0,100% 100%,18% 100%,12% 86%,6% 100%,0 88%)';
      if (S.style.banner && S.style.banner.tape) tp.style.backgroundColor = S.style.banner.tape;
      if (S.style.banner && S.style.banner.tape === 'none') tp.style.display = 'none';
      tp.style.backgroundImage = tex('paper');
      tp.style.backgroundBlendMode = 'multiply';
      wrap.appendChild(tp);
    }
    root.appendChild(wrap);
    root._w = w; root._h = h;
    return root;
  }

  // ---- captions (word tags on the floor) ----
  const AR = /[؀-ۿ]/;
  function parseCaptions(sc) {
    const words = [];
    if (Array.isArray(sc.words)) {
      for (const w of sc.words) words.push({ t: w[0], w: String(w[1]) });
    } else if (sc.captions) {
      const toks = String(sc.captions).trim().split(/\s+/);
      const wt = toks.map((k) => (k === '|' ? 0 : k.replace(/[|]/g, '').length + 2));
      const total = wt.reduce((a, b) => a + b, 0) || 1;
      const t0 = sc.captionStart != null ? sc.captionStart : 0.25;
      const t1 = sc.captionEnd != null ? sc.captionEnd : sc.dur - 0.3;
      let acc = 0;
      for (let i = 0; i < toks.length; i++) {
        if (toks[i] === '|') { words.push({ t: t0 + (acc / total) * (t1 - t0), w: '|' }); continue; }
        words.push({ t: t0 + (acc / total) * (t1 - t0), w: toks[i] });
        acc += wt[i];
      }
    }
    return words;
  }

  function buildCaptions() {
    capsRoot = div('', { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', zIndex: 950, pointerEvents: 'none' });
    groups = [];
    scenes.forEach((sc, si) => {
      const ws = parseCaptions(sc.spec);
      let cur = null;
      const flush = () => { if (cur && cur.words.length) groups.push(cur); cur = null; };
      let prevT = -9;
      for (const w of ws) {
        if (w.w === '|') { flush(); continue; }
        const word = w.w.endsWith('|') ? w.w.slice(0, -1) : w.w;
        const brk = w.w.endsWith('|');
        if (cur && (cur.words.length >= (sc.spec.maxWords || S.maxWords) || w.t - prevT > 1.1)) flush();
        if (!cur) cur = { scene: si, words: [], t0: sc.start + w.t };
        cur.words.push({ t: sc.start + w.t, text: word });
        prevT = w.t;
        if (brk) flush();
      }
      flush();
    });
    groups.forEach((g, gi) => {
      const row = div('caps');
      row.style.top = S.captionY + 'px';
      const rtl = g.words.some((w) => AR.test(w.text)) || S.dir === 'rtl';
      row.style.direction = rtl ? 'rtl' : 'ltr';
      g.words.forEach((w, wi) => {
        const r = rng('cap' + gi + '-' + wi);
        const tag = div('cap');
        tag.textContent = w.text;
        const gth = scenes[g.scene].th;
        if (gth.capBg) tag.style.backgroundColor = gth.capBg;
        if (gth.capInk) tag.style.color = gth.capInk;
        tag.style.backgroundImage = tex('paper');
        tag.style.backgroundSize = '256px 256px';
        tag.style.fontSize = (S.captionSize || 38) + 'px';
        const rot = (r() - 0.5) * 6, dy = (r() - 0.5) * 12;
        tag.style.setProperty('--rot', rot + 'deg');
        tag._rot = rot; tag._dy = dy;
        tag.style.clipPath = cutPoly(100, 56, 1, gi * 13 + wi, [2, 2, 2, 2]).replace(/-?\d+(\.\d+)?px/g, (m) => m); // placeholder; replaced on measure
        w.el = tag;
        row.appendChild(tag);
      });
      g.el = row;
      capsRoot.appendChild(row);
    });
    // exact hand-cut clip per tag once sizes are known
    groups.forEach((g, gi) => g.words.forEach((w, wi) => {
      const probe = w.el.cloneNode(true);
      probe.style.clipPath = 'none';
      const m = measure(probe);
      w.el.style.clipPath = cutPoly(m.w, m.h, 1.6, gi * 13 + wi, [1.8, 1.6, 1.8, 1.6]);
      w.el.style.boxShadow = 'none';
      w.el.style.filter = 'drop-shadow(1px 4px 3px rgba(0,0,0,.36))';
    }));
    return capsRoot;
  }

  function setCaptions(t) {
    groups.forEach((g, gi) => {
      const next = groups[gi + 1];
      const sc = scenes[g.scene];
      const endT = Math.min(next && next.scene === g.scene ? next.t0 : sc.start + sc.spec.dur, sc.start + sc.spec.dur);
      const on = t >= g.t0 && t < endT;
      g.el.style.display = on ? 'flex' : 'none';
      if (!on) return;
      g.words.forEach((w) => {
        const p = clamp((t - w.t) / 0.16);
        if (t < w.t) { w.el.style.visibility = 'hidden'; return; }
        w.el.style.visibility = 'visible';
        const k = E.outBack(p);
        w.el.style.transform = 'translateY(' + (w._dyv != null ? w._dyv : (w._dyv = w.el._dy)) + 'px) rotate(' + w.el._rot + 'deg) scale(' + (0.55 + 0.45 * k).toFixed(3) + ')';
        w.el.style.opacity = clamp(p * 4);
      });
    });
  }

  // ---- public API ----
  PM.init = async function (sb) {
    S = PM.S = normalize(sb);
    stage = document.getElementById('stage');
    stage.style.width = S.width + 'px';
    // brand overrides: storyboard.style = { banner:{paper,ink,upper,ls,tape,torn,size}, caption:{bg,ink,font,size}, grain, vignette }
    const st = S.style, sb_ = st.banner || {}, sc_ = st.caption || {};
    const setv = (k, v) => { if (v != null) stage.style.setProperty(k, v); };
    setv('--banner-paper', sb_.paper); setv('--banner-ink', sb_.ink); setv('--banner-ls', sb_.ls != null ? sb_.ls + 'em' : null);
    setv('--banner-case', sb_.upper === false ? 'none' : null); setv('--banner-font', sb_.font);
    setv('--cap-bg', sc_.bg); setv('--cap-ink', sc_.ink); setv('--cap-font', sc_.font);
    setv('--grain', st.grain); setv('--vignette', st.vignette);
    stage.style.height = S.height + 'px';
    stage.innerHTML = '';
    // make sure every face is loaded before anything is measured
    const faces = ['800 30px "Inter Tight"', '900 30px "Inter Tight"', '700 30px "Cairo"', '800 30px "Cairo"', '700 30px "Fraunces"', '400 30px "Anton"', '500 20px "JetBrains Mono"'];
    await Promise.all(faces.map((f) => document.fonts.load(f, 'Aaال')));
    await document.fonts.ready;

    scenes = [];
    S.scenes.forEach((spec, si) => {
      const th = themeOf(spec);
      const root = div('scene');
      buildBackdrop(root, th, spec);
      const sc = { spec, root, start: spec.start, th, items: [], si };
      // skyline-type background props are ordinary elements with low z; floor sits above them
      const bgItems = [], fgItems = [];
      (spec.elements || []).forEach((e, i) => { (e.behind ? bgItems : fgItems).push([e, i]); });
      bgItems.forEach(([e, i]) => { const it = makeEl(e, i - 1000, sc); sc.items.push(it); root.appendChild(it.el); });
      buildFloor(root, th, spec);
      fgItems.forEach(([e, i]) => { const it = makeEl(e, i, sc); sc.items.push(it); root.appendChild(it.el); });
      // banner
      let btxt = spec.banner;
      sc.bannerKeep = false;
      if (btxt === undefined && si > 0 && scenes[si - 1].bannerText) { btxt = scenes[si - 1].bannerText; sc.bannerKeep = true; }
      if (btxt) {
        sc.bannerText = typeof btxt === 'string' ? btxt : btxt.text;
        sc.banner = buildBanner(sc, th, sc.bannerText);
        sc.banner.style.zIndex = 900;
        root.appendChild(sc.banner);
        sc.bannerY = (typeof btxt === 'object' && btxt.y) || spec.bannerY || S.bannerY || 215;
        sc.bannerTilt = (typeof btxt === 'object' && btxt.tilt != null ? btxt.tilt : ((hash(sc.bannerText) % 7) - 3) * 0.35);
      }
      const gr = div('grain'); if (S.style.grain != null) gr.style.opacity = S.style.grain; gr.style.backgroundImage = tex('paper'); gr.style.backgroundSize = '256px 256px'; root.appendChild(gr);
      scenes.push(sc);
      stage.appendChild(root);
    });
    stage.appendChild(buildCaptions());
    const vg = div('vignette'); vg.style.zIndex = 990; if (S.style.vignette != null) vg.style.opacity = S.style.vignette; stage.appendChild(vg);
    if (S.review) {
      reviewEl = div('', { position: 'absolute', left: '14px', bottom: '14px', zIndex: 999, font: '700 15px/1.25 var(--f-mono)', color: '#fff', background: 'rgba(0,0,0,.72)', padding: '6px 9px', borderRadius: '5px', maxWidth: (S.width - 28) + 'px', whiteSpace: 'pre-wrap', direction: 'ltr' });
      stage.appendChild(reviewEl);
    }
    PM.duration = S.duration;
    PM.ready = true;
    PM.setTime(0);
    return { duration: S.duration, width: S.width, height: S.height, fps: S.fps };
  };

  PM.setTime = function (t) {
    t = clamp(t, 0, S.duration - 1e-6);
    scenes.forEach((sc, si) => {
      const lt = t - sc.start;
      const next = scenes[si + 1];
      const nextTr = next && next.spec.transition !== 'cut' ? (next.spec.transitionDur || 0.45) : 0;
      const endT = sc.start + sc.spec.dur;
      const vis = lt >= 0 && t < endT + nextTr;
      sc.root.style.display = vis ? '' : 'none';
      if (!vis) return;
      sc.root.style.zIndex = si;
      let tx = 0, ty = 0, op = 1;
      const tr = sc.spec.transition;
      const trd = sc.spec.transitionDur || 0.45;
      if (si > 0 && tr !== 'cut' && lt < trd) {
        const p = E.inOutCubic(clamp(lt / trd));
        if (tr === 'slide' || tr === 'push') tx = (1 - p) * S.width;
        else if (tr === 'rise') ty = (1 - p) * S.height;
        else if (tr === 'fade') op = p;
        else if (tr === 'drop') ty = -(1 - E.outBounce(p)) * S.height;
      }
      // being covered by the next scene
      if (t >= endT && nextTr) {
        const q = E.inOutCubic(clamp((t - endT) / nextTr));
        const ntr = next.spec.transition;
        if (ntr === 'slide') tx = -q * S.width * 0.25;
        else if (ntr === 'push') tx = -q * S.width;
      }
      sc.root.style.transform = 'translate(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px)';
      sc.root.style.opacity = op;
      sc.items.forEach((it) => applyEl(it, lt));
      if (sc.banner) {
        const at = sc.bannerKeep ? -1 : (sc.spec.bannerAt != null ? sc.spec.bannerAt : 0.25);
        const p = clamp((lt - at) / 0.6);
        const k = E.outBack(p);
        const dy = sc.bannerKeep ? 0 : -(1 - k) * 220;
        const rr = sc.bannerTilt + (sc.bannerKeep ? 0 : (1 - k) * -7);
        sc.banner.style.transform = 'translate(' + (S.width / 2) + 'px,' + (sc.bannerY + dy) + 'px) rotate(' + rr.toFixed(2) + 'deg)';
        sc.banner.style.opacity = sc.bannerKeep ? 1 : clamp((lt - at) * 10);
      }
    });
    setCaptions(t);
    if (reviewEl) {
      const cur = scenes.find((sc) => t >= sc.start && t < sc.start + sc.spec.dur) || scenes[scenes.length - 1];
      const sp = cur.spec;
      reviewEl.textContent = (sp.id || ('S' + (cur.si + 1))) + '  ' + (sp.status || 'NO STATUS') + (sp.note ? '\n' + sp.note : '');
      reviewEl.style.background = !sp.status ? 'rgba(180,0,0,.85)' : sp.status === 'CONFIRMED' ? 'rgba(20,110,60,.85)' : sp.status === 'FOUNDER' ? 'rgba(30,70,150,.85)' : 'rgba(90,90,90,.85)';
    }
  };
})();
