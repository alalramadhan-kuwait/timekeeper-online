/* paper-motion element library. Each builder: (spec, ctx) -> { node, w, h, anchor?, update?(lt, state) }.
 * `lt` is always scene-local seconds, so every time in a storyboard reads the same way. */
(function () {
  'use strict';
  const PM = window.PM;
  const B = PM.builders;
  const { clamp } = PM.util;

  const px = (n) => n.toFixed(1) + 'px';
  function put(parent, o) { const p = PM.piece(o); parent.appendChild(p); return p; }
  function box(parent, style) { const d = PM.div('', Object.assign({ position: 'absolute' }, style)); parent.appendChild(d); return d; }
  function text(parent, str, o) {
    const d = PM.div('txt');
    d.textContent = str;
    d.style.fontFamily = { banner: 'var(--f-banner)', cap: 'var(--f-cap)', title: 'var(--f-title)', mono: 'var(--f-mono)', ui: 'var(--f-ui)' }[o.font || 'ui'];
    d.style.fontSize = (o.size || 24) + 'px';
    d.style.fontWeight = o.weight || 800;
    d.style.color = o.color || '#1b1a18';
    d.style.left = (o.x || 0) + 'px';
    d.style.top = (o.y || 0) + 'px';
    d.style.unicodeBidi = 'plaintext';
    if (o.w) { d.style.width = o.w + 'px'; d.style.whiteSpace = 'pre-wrap'; d.style.lineHeight = String(o.lh || 1.12); }
    if (o.align) d.style.textAlign = o.align;
    if (o.center) { d.style.display = 'flex'; d.style.alignItems = 'center'; d.style.justifyContent = 'center'; d.style.textAlign = 'center'; }
    if (o.h) d.style.height = o.h + 'px';
    if (o.upper) d.style.textTransform = 'uppercase';
    if (o.ls != null) d.style.letterSpacing = o.ls + 'em';
    parent.appendChild(d);
    return d;
  }
  const shade = (hex, k) => {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.round(clamp(v * k, 0, 255));
    return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('');
  };

  // ---------------------------------------------------------------- mascot
  // A blocky paper character. `gear` picks the outfit; `look` the face. Anchor is the feet.
  B.mascot = (sp, ctx) => {
    const u = (sp.size || 200) / 200;
    const skin = sp.color || '#E5835A', dark = shade(skin, 0.9);
    const W = 340 * u, bodyW = 200 * u, bodyH = 150 * u, legH = 58 * u, headroom = 150 * u;
    const H = headroom + bodyH + legH;
    const bx = (W - bodyW) / 2, by = headroom;
    const node = PM.div('', { position: 'relative', width: px(W), height: px(H) });
    const gear = sp.gear || 'none';
    const gc = sp.gearColor;
    const parts = {};

    // wings sit behind the body
    if (gear === 'wings') {
      const wc = gc || '#7B5CF0', trim = '#F0B73C';
      for (const s of [-1, 1]) {
        const w = put(node, { w: 170 * u, h: 200 * u, edge: 'poly', color: wc, x: s < 0 ? bx - 150 * u : bx + bodyW - 20 * u, y: by - 120 * u,
          poly: s < 0 ? 'polygon(100% 100%,0 20%,22% 0,38% 28%,58% 8%,70% 40%,100% 30%)' : 'polygon(0 100%,100% 20%,78% 0,62% 28%,42% 8%,30% 40%,0 30%)' });
        put(w, { w: 60 * u, h: 120 * u, edge: 'poly', color: shade(wc, 1.25), x: s < 0 ? 90 * u : 20 * u, y: 70 * u, poly: 'polygon(30% 0,100% 40%,60% 100%,0 60%)', shadow: false });
      }
    }
    for (let i = 0; i < 4; i++) {
      const lx = bx + [16, 58, 118, 160][i] * u;
      parts['leg' + i] = put(node, { w: 26 * u, h: legH, x: lx, y: by + bodyH - 6 * u, color: dark, j: 1 });
    }
    // arms
    parts.armL = put(node, { w: 44 * u, h: 28 * u, x: bx - 38 * u, y: by + 66 * u, color: skin, j: 1 });
    parts.armR = put(node, { w: 44 * u, h: 28 * u, x: bx + bodyW - 6 * u, y: by + 66 * u, color: skin, j: 1 });
    parts.body = put(node, { w: bodyW, h: bodyH, x: bx, y: by, color: skin, j: 1.6 });

    // face
    const face = box(node, { left: px(bx), top: px(by), width: px(bodyW), height: px(bodyH) });
    const eyeL = box(face, { left: px(58 * u), top: px(46 * u), width: px(17 * u), height: px(34 * u), background: '#161412', transformOrigin: '50% 50%' });
    const eyeR = box(face, { left: px(125 * u), top: px(46 * u), width: px(17 * u), height: px(34 * u), background: '#161412', transformOrigin: '50% 50%' });
    const mouth = box(face, { left: px(86 * u), top: px(98 * u), width: px(28 * u), height: px(5 * u), background: '#161412', display: 'none' });
    const brow = [box(face, { left: px(50 * u), top: px(30 * u), width: px(32 * u), height: px(5 * u), background: '#161412', display: 'none' }),
                  box(face, { left: px(118 * u), top: px(30 * u), width: px(32 * u), height: px(5 * u), background: '#161412', display: 'none' })];

    const topY = by; // gear is drawn relative to the top of the body
    const G = {
      headband() {
        const c = gc || '#2AA6A6';
        put(node, { w: bodyW + 8 * u, h: 24 * u, x: bx - 4 * u, y: topY + 14 * u, color: c, j: 1 });
        for (let i = 0; i < 6; i++) box(node, { left: px(bx + (20 + i * 31) * u), top: px(topY + 22 * u), width: px(6 * u), height: px(6 * u), borderRadius: '50%', background: '#F4EFE2' });
        put(node, { w: 52 * u, h: 14 * u, x: bx + bodyW - 6 * u, y: topY + 10 * u, color: c, rot: -24, origin: '0 50%', j: .8 });
        put(node, { w: 48 * u, h: 14 * u, x: bx + bodyW - 6 * u, y: topY + 24 * u, color: c, rot: 12, origin: '0 50%', j: .8 });
      },
      hardhat() {
        const c = gc || '#F2B632';
        put(node, { w: 150 * u, h: 66 * u, x: bx + 25 * u, y: topY - 56 * u, color: c, edge: 'round', radius: px(75 * u) + ' ' + px(75 * u) + ' 4px 4px' });
        put(node, { w: 200 * u, h: 16 * u, x: bx, y: topY - 10 * u, color: shade(c, .92), j: 1 });
        put(node, { w: 20 * u, h: 66 * u, x: bx + 90 * u, y: topY - 56 * u, color: shade(c, 1.08), shadow: false });
        const lamp = put(node, { w: 36 * u, h: 36 * u, x: bx + 82 * u, y: topY - 44 * u, edge: 'circle', color: '#8F969E' });
        box(lamp, { left: px(10 * u), top: px(8 * u), width: px(10 * u), height: px(10 * u), borderRadius: '50%', background: '#fff', opacity: .9 });
        put(node, { w: 16 * u, h: 8 * u, x: bx + 92 * u, y: topY + 40 * u, color: '#F2B632', shadow: false });
      },
      helmet() {
        const c = gc || '#EDF1F4';
        put(node, { w: 176 * u, h: 82 * u, x: bx + 12 * u, y: topY - 66 * u, color: c, edge: 'round', radius: px(80 * u) + ' ' + px(80 * u) + ' 6px 6px' });
        put(node, { w: 24 * u, h: 82 * u, x: bx + 88 * u, y: topY - 66 * u, color: '#2F6FD0', shadow: false });
        put(node, { w: 200 * u, h: 16 * u, x: bx, y: topY - 8 * u, color: shade(c, .9), j: 1 });
        for (const s of [0, 1]) put(node, { w: 26 * u, h: 44 * u, x: s ? bx + bodyW - 10 * u : bx - 16 * u, y: topY + 4 * u, color: '#B9C1C9', j: 1 });
        put(node, { w: 6 * u, h: 36 * u, x: bx + 150 * u, y: topY - 92 * u, color: '#8F969E', shadow: false });
        box(node, { left: px(bx + 145 * u), top: px(topY - 100 * u), width: px(16 * u), height: px(16 * u), borderRadius: '50%', background: '#E8472E' });
      },
      racer() {
        const c = gc || '#EE5632';
        put(node, { w: 184 * u, h: 92 * u, x: bx + 8 * u, y: topY - 80 * u, color: c, edge: 'round', radius: px(88 * u) + ' ' + px(88 * u) + ' 6px 6px' });
        put(node, { w: 26 * u, h: 112 * u, x: bx + 87 * u, y: topY - 104 * u, color: '#F4F0E6', j: 1, shadow: false });
        put(node, { w: 200 * u, h: 18 * u, x: bx, y: topY - 10 * u, color: shade(c, .86), j: 1 });
        for (const s of [0, 1]) {
          put(node, { w: 52 * u, h: 38 * u, x: s ? bx + bodyW - 8 * u : bx - 44 * u, y: topY + 44 * u, color: '#C4CAD2', j: 1 });
          box(node, { left: px((s ? bx + bodyW + 6 * u : bx - 30 * u)), top: px(topY + 56 * u), width: px(12 * u), height: px(12 * u), borderRadius: '50%', background: '#EFA531' });
        }
      },
      robot() {
        const c = gc || '#4C5059';
        put(node, { w: 190 * u, h: 100 * u, x: bx + 5 * u, y: topY - 86 * u, color: c, edge: 'round', radius: px(92 * u) + ' ' + px(92 * u) + ' 6px 6px' });
        put(node, { w: 12 * u, h: 100 * u, x: bx + 94 * u, y: topY - 86 * u, color: '#D2412B', shadow: false });
        put(node, { w: 190 * u, h: 12 * u, x: bx + 5 * u, y: topY - 44 * u, color: '#D2412B', shadow: false });
        put(node, { w: 204 * u, h: 18 * u, x: bx - 2 * u, y: topY - 10 * u, color: shade(c, .8), j: 1 });
        put(node, { w: 5 * u, h: 40 * u, x: bx + 48 * u, y: topY - 124 * u, color: '#8F969E', shadow: false });
        box(node, { left: px(bx + 40 * u), top: px(topY - 136 * u), width: px(20 * u), height: px(20 * u), borderRadius: '50%', background: '#E8472E' });
        for (const s of [0, 1]) {
          put(node, { w: 54 * u, h: 62 * u, x: s ? bx + bodyW - 10 * u : bx - 44 * u, y: topY + 36 * u, color: '#555A64', j: 1 });
          put(node, { w: 54 * u, h: 12 * u, x: s ? bx + bodyW - 10 * u : bx - 44 * u, y: topY + 36 * u, color: '#8A919B', shadow: false });
        }
        const orb = box(node, { left: px(bx + 91 * u), top: px(topY + 124 * u), width: px(18 * u), height: px(18 * u), borderRadius: '50%', background: '#D93B27', boxShadow: '0 0 0 3px #333' });
        parts.flames = [0, 1].map((s) => put(node, { w: 26 * u, h: 52 * u, x: bx + (s ? 140 : 34) * u, y: by + bodyH + legH - 4 * u, edge: 'poly', color: '#F59A2B', shadow: false,
          poly: 'polygon(0 0,100% 0,70% 60%,50% 100%,30% 60%)', origin: '50% 0' }));
        parts.flames.forEach((f) => (f.style.display = sp.thrusters === false ? 'none' : ''));
      },
      wings() {
        const c = '#F0B73C';
        put(node, { w: 130 * u, h: 52 * u, x: bx + 35 * u, y: topY - 44 * u, edge: 'poly', color: c, poly: 'polygon(0 100%,8% 20%,28% 70%,50% 0,72% 70%,92% 20%,100% 100%)' });
        box(node, { left: px(bx + 90 * u), top: px(topY - 22 * u), width: px(20 * u), height: px(20 * u), borderRadius: '50%', background: '#E8472E' });
        put(node, { w: 200 * u, h: 14 * u, x: bx, y: topY - 6 * u, color: '#7B5CF0', j: 1 });
      },
      sunglasses() {
        put(node, { w: 150 * u, h: 38 * u, x: bx + 25 * u, y: topY + 38 * u, color: '#161412', j: 1 });
      },
      none() {},
    };
    (G[gear] || G.none)();

    const looks = (lt) => {
      let l = sp.look || 'neutral';
      if (Array.isArray(l)) { let cur = l[0][1]; for (const k of l) if (lt >= k[0]) cur = k[1]; l = cur; }
      return l;
    };
    const R = ctx.rng('mascot' + ctx.idx);
    const blinkPhase = R() * 3;
    return {
      node, w: W, h: H, anchor: 'b',
      update(lt) {
        const look = looks(lt);
        let eh = 34 * u, ew = 17 * u, et = 46 * u, mouthOn = false, mw = 28 * u, brows = 0, rot = 0;
        if (look === 'happy') { eh = 22 * u; et = 52 * u; mouthOn = true; mw = 40 * u; }
        else if (look === 'sleepy') { eh = 5 * u; ew = 22 * u; et = 62 * u; }
        else if (look === 'wide') { eh = 40 * u; ew = 22 * u; et = 42 * u; mouthOn = true; mw = 16 * u; }
        else if (look === 'worried') { eh = 30 * u; brows = 1; mouthOn = true; mw = 22 * u; }
        else if (look === 'smug') { eh = 10 * u; ew = 22 * u; et = 58 * u; mouthOn = true; mw = 34 * u; rot = 0; }
        else if (look === 'angry') { eh = 24 * u; brows = -1; mouthOn = true; mw = 30 * u; }
        const blink = look !== 'sleepy' && ((lt + blinkPhase) % 3.4) < 0.12 ? 0.12 : 1;
        for (const [i, e] of [eyeL, eyeR].entries()) {
          e.style.height = px(eh); e.style.width = px(ew); e.style.top = px(et + (34 * u - eh) / 2 * 0);
          e.style.left = px((i ? 125 : 58) * u - (ew - 17 * u) / 2);
          e.style.transform = 'scaleY(' + blink + ')';
        }
        mouth.style.display = mouthOn ? '' : 'none';
        mouth.style.width = px(mw); mouth.style.left = px(100 * u - mw / 2);
        mouth.style.height = px((look === 'wide' ? 16 : 5) * u);
        mouth.style.top = px(look === 'happy' ? 100 * u : 98 * u);
        mouth.style.borderRadius = look === 'happy' ? '0 0 ' + px(24 * u) + ' ' + px(24 * u) : look === 'worried' ? px(10 * u) + ' ' + px(10 * u) + ' 0 0' : '2px';
        mouth.style.height = px((look === 'happy' ? 12 : look === 'wide' ? 16 : 5) * u);
        brow.forEach((b, i) => {
          b.style.display = brows ? '' : 'none';
          b.style.transform = 'rotate(' + (brows * (i ? -14 : 14)) + 'deg)';
        });
        // walking legs
        const walking = sp.walk === true || (Array.isArray(sp.walk) && sp.walk.some((r) => lt >= r[0] && lt <= r[1]));
        for (let i = 0; i < 4; i++) {
          const leg = parts['leg' + i];
          const up = walking && (Math.floor(lt * 7) + (i % 2)) % 2 === 0;
          leg.style.transform = up ? 'translateY(' + px(-9 * u) + ')' : '';
        }
        if (parts.flames) {
          parts.flames.forEach((f, i) => { f.style.transform = 'scaleY(' + (0.8 + 0.5 * Math.abs(Math.sin(lt * 31 + i))) + ')'; });
        }
      },
    };
  };

  // ---------------------------------------------------------------- card / sticky / nameplate
  B.card = (sp, ctx) => {
    const w = sp.w || 300, h = sp.h || 200;
    const node = PM.div('', { position: 'relative', width: px(w), height: px(h) });
    const style = sp.style || 'plain';
    const color = sp.color || (style === 'sticky' ? '#F6E27A' : style === 'dark' ? '#15171C' : '#F6EEDD');
    const ink = sp.ink || (style === 'dark' ? '#F1ECE0' : '#1E1C1A');
    put(node, { w, h, color, tex: sp.tex || 'paper', j: sp.j, edge: sp.edge || 'cut', radius: sp.radius, shadow: sp.shadow });
    let y = 10;
    if (sp.header) {
      const hh = sp.headerH || 54;
      const band = put(node, { w: w - 20, h: hh, x: 10, y: 10, color: sp.headerColor || '#15171C', j: 1 });
      text(band, sp.header, { font: 'title', size: sp.headerSize || 36, weight: 400, color: sp.headerInk || '#fff', w: w - 20, h: hh, center: true, ls: .03 });
      y += hh + 8;
    }
    if (sp.title) { const t = text(node, sp.title, { font: sp.titleFont || 'banner', size: sp.titleSize || 28, color: ink, x: 16, y: y + 4, w: w - 32, align: sp.align || 'left' }); y += t.offsetHeight || 34; }
    if (sp.body) text(node, sp.body, { font: sp.bodyFont || 'ui', size: sp.bodySize || 20, weight: 700, color: ink, x: 16, y: y + 8, w: w - 32, align: sp.align || 'left', lh: 1.25 });
    if (sp.label) text(node, sp.label, { font: sp.labelFont || 'banner', size: sp.labelSize || 30, color: ink, w, h, center: true });
    if (sp.pin || style === 'sticky') {
      const pc = sp.pinColor || '#D23C2B';
      const pin = box(node, { left: px(w / 2 - 9), top: px(-2), width: '18px', height: '18px', borderRadius: '50%', background: pc, boxShadow: '1px 3px 3px rgba(0,0,0,.4), inset -3px -3px 0 rgba(0,0,0,.2)' });
    }
    if (sp.tape) {
      const t = put(node, { w: 70, h: 28, x: w / 2 - 35, y: -14, color: 'rgba(214,190,128,1)', rot: -3, j: .8 });
    }
    return { node, w, h };
  };
  B.sticky = (sp, ctx) => B.card(Object.assign({ style: 'sticky', w: 130, h: 120, rot: -4 }, sp), ctx);

  // ---------------------------------------------------------------- terminal chip
  B.chip = (sp, ctx) => {
    const str = sp.text || '/command';
    const prefix = sp.prefix == null ? '>' : sp.prefix;
    const size = sp.size || 18;
    const w = sp.w || Math.max(150, (str.length + prefix.length + 4) * size * 0.62 + 56), h = sp.h || size * 2.2;
    const node = PM.div('', { position: 'relative', width: px(w), height: px(h) });
    put(node, { w, h, color: sp.color || '#14161B', edge: 'round', radius: 9, tex: 'paper', bevel: false });
    // little burst glyph
    const g = box(node, { left: '12px', top: px(h / 2 - 8), width: '16px', height: '16px' });
    for (let i = 0; i < 4; i++) box(g, { left: '7px', top: '0', width: '2.5px', height: '16px', background: sp.glyph || '#E5835A', transform: 'rotate(' + i * 45 + 'deg)' });
    const t = text(node, '', { font: 'mono', size, weight: 500, color: sp.ink || '#EAE4D6', x: 38, y: h / 2 - size / 2 - 1 });
    const caret = box(node, { width: '8px', height: px(size + 2), background: '#E5835A', top: px(h / 2 - size / 2 - 2) });
    return {
      node, w, h,
      update(lt) {
        const at = sp.typeAt || 0, dur = sp.typeDur != null ? sp.typeDur : 0.9;
        const full = prefix + (prefix ? ' ' : '') + str;
        const n = sp.type === false ? full.length : Math.round(clamp((lt - at) / dur) * full.length);
        t.textContent = full.slice(0, n);
        caret.style.left = px(38 + n * size * 0.6);
        caret.style.opacity = Math.floor(lt * 2.2) % 2 === 0 || n < full.length ? 1 : 0;
      },
    };
  };

  // ---------------------------------------------------------------- effort-style dial / selector
  B.dial = (sp, ctx) => {
    const D = sp.size || 300;
    const segs = sp.segments || ['#2BB5B0', '#F2B632', '#3B7DDB', '#F26B2D', '#D63C3C', '#7A5AF8'];
    const labels = sp.labels || segs.map((_, i) => String(i + 1));
    const n = segs.length;
    const panelW = D * 1.12, panelH = D * 1.18;
    const node = PM.div('', { position: 'relative', width: px(panelW), height: px(panelH) });
    if (sp.panel !== false) put(node, { w: panelW, h: panelH, color: '#8A5733', tex: 'wood', edge: 'round', radius: 14, j: 1 });
    const scr = put(node, { w: panelW * .66, h: 58, x: panelW * .17, y: 14, color: '#0E1015', edge: 'round', radius: 7, bevel: false });
    const lcd = text(scr, labels[0], { font: 'title', size: 44, weight: 400, color: segs[0], w: panelW * .66, h: 58, center: true, ls: .04 });
    const cx = panelW / 2, cy = panelH * .56, ringR = D * .4;
    const ring = put(node, { w: ringR * 2, h: ringR * 2, x: cx - ringR, y: cy - ringR, edge: 'circle', color: '#F4F1EA' });
    const ticks = [];
    for (let i = 0; i < n; i++) {
      const a = -140 + (280 * i) / (n - 1);
      const holder = box(node, { left: px(cx), top: px(cy), width: '0', height: '0', transform: 'rotate(' + a + 'deg)' });
      ticks.push(box(holder, { left: px(-14), top: px(-ringR + 8), width: '28px', height: '16px', background: '#DAD0BC', borderRadius: '3px', boxShadow: '1px 2px 2px rgba(0,0,0,.25)' }));
    }
    const kr = D * .27;
    const knobHolder = box(node, { left: px(cx), top: px(cy), width: '0', height: '0' });
    const knob = box(knobHolder, { left: px(-kr), top: px(-kr), width: px(kr * 2), height: px(kr * 2) });
    put(knob, { w: kr * 2, h: kr * 2, edge: 'circle', color: sp.knob || '#E5835A', shadow: 'soft' });
    box(knob, { left: px(kr * .22), top: px(kr * .22), width: px(kr * 1.56), height: px(kr * 1.56), borderRadius: '50%', border: '3px solid rgba(255,255,255,.28)' });
    const ast = box(knob, { left: px(kr - 1), top: px(kr - 1), width: '2px', height: '2px' });
    for (let i = 0; i < 4; i++) box(ast, { left: px(-1.5), top: px(-kr * .42), width: '3px', height: px(kr * .84), background: '#fff', transform: 'rotate(' + i * 45 + 'deg)' });
    box(knob, { left: px(kr - 4), top: px(3), width: '8px', height: px(kr * .55), background: '#fff', borderRadius: '2px' });
    return {
      node, w: panelW, h: panelH,
      update(lt) {
        const v = PM.val(sp.value, lt, 0);
        const idx = clamp(Math.round(v), 0, n - 1);
        knobHolder.style.transform = 'rotate(' + (-140 + (280 * v) / (n - 1)) + 'deg)';
        ticks.forEach((t, i) => { t.style.background = i <= idx ? segs[i] : '#DAD0BC'; });
        lcd.textContent = labels[idx]; lcd.style.color = segs[idx];
      },
    };
  };

  // ---------------------------------------------------------------- stopwatch
  B.stopwatch = (sp, ctx) => {
    const D = sp.size || 150;
    const node = PM.div('', { position: 'relative', width: px(D), height: px(D + 22) });
    put(node, { w: 28, h: 20, x: D / 2 - 14, y: 0, color: '#8F969E', j: 1 });
    const body = put(node, { w: D, h: D, x: 0, y: 18, edge: 'circle', color: '#C9CED4', shadow: 'soft' });
    const face = box(node, { left: px(D * .08), top: px(18 + D * .08), width: px(D * .84), height: px(D * .84), borderRadius: '50%', background: '#F7F4EC' });
    for (let i = 0; i < 12; i++) box(face, { left: px(D * .42 - 1.5), top: px(4), width: '3px', height: i % 3 ? '7px' : '12px', background: '#333', transformOrigin: '50% ' + px(D * .42 - 4), transform: 'rotate(' + i * 30 + 'deg)' });
    const wedge = box(face, { left: '0', top: '0', width: '100%', height: '100%', borderRadius: '50%' });
    const hand = box(node, { left: px(D / 2 - 1.5), top: px(18 + D / 2 - D * .36), width: '3px', height: px(D * .36), background: '#D4372A', transformOrigin: '50% 100%' });
    box(node, { left: px(D / 2 - 6), top: px(18 + D / 2 - 6), width: '12px', height: '12px', borderRadius: '50%', background: '#222' });
    return {
      node, w: D, h: D + 22,
      update(lt) {
        const turns = PM.val(sp.sweep, lt, 0);
        hand.style.transform = 'rotate(' + turns * 360 + 'deg)';
        wedge.style.background = 'conic-gradient(rgba(212,55,42,.38) 0deg ' + turns * 360 + 'deg, transparent ' + turns * 360 + 'deg)';
      },
    };
  };

  // ---------------------------------------------------------------- stack of books / blocks
  B.books = (sp, ctx) => {
    const n = sp.n || 4, bw = sp.w || 96, bh = sp.bookH || 28;
    const colors = sp.colors || ['#2AA6A6', '#E5835A', '#3B7DDB', '#F2B632', '#7A5AF8'];
    const node = PM.div('', { position: 'relative', width: px(bw + 20), height: px(n * bh + 10) });
    const items = [];
    for (let i = 0; i < n; i++) {
      const b = put(node, { w: bw, h: bh, x: 10 + ((i * 7) % 11) - 5, y: (n - 1 - i) * bh + 6, color: colors[i % colors.length], j: 1 });
      put(b, { w: bw * .5, h: bh * .42, x: bw * .25, y: bh * .29, color: '#F6F1E4', shadow: false, j: .6 });
      box(b, { left: '0', top: '0', width: '8px', height: '100%', background: 'rgba(0,0,0,.14)' });
      items.push(b);
    }
    return {
      node, w: bw + 20, h: n * bh + 10, anchor: 'b',
      update(lt) {
        const at = sp.at || 0, st = sp.stagger != null ? sp.stagger : 0.16;
        items.forEach((b, i) => {
          const p = clamp((lt - at - i * st) / 0.4);
          b.style.visibility = lt < at + i * st ? 'hidden' : 'visible';
          b.style.transform = 'translateY(' + -(1 - PM.E.outBounce(p)) * 160 + 'px)';
        });
      },
    };
  };

  // ---------------------------------------------------------------- skyline (city silhouette with lit windows)
  B.skyline = (sp, ctx) => {
    const Wd = sp.w || ctx.S.width, Hm = sp.h || 340;
    const r = ctx.rng(sp.seed || 'sky' + ctx.idx);
    const color = sp.color || '#1B2352', lit = sp.lit || '#F5C65B', dim = sp.dim || shade(color, 1.35);
    const node = PM.div('', { position: 'relative', width: px(Wd), height: px(Hm) });
    const wins = [];
    let x = -10;
    while (x < Wd) {
      const bw = 56 + Math.floor(r() * 54), bh = Hm * (0.35 + r() * 0.65);
      const b = put(node, { w: bw, h: bh, x, y: Hm - bh, color, shadow: false, j: 1.2, bevel: false });
      const cols = Math.max(2, Math.floor((bw - 12) / 15)), rows = Math.floor((bh - 16) / 22);
      for (let ry = 0; ry < rows; ry++) for (let cx = 0; cx < cols; cx++) {
        if (r() < (sp.density == null ? 0.7 : sp.density)) {
          const on = r() < (sp.litShare == null ? 0.38 : sp.litShare);
          const wEl = box(b, { left: px(8 + cx * ((bw - 16) / cols) + 2), top: px(10 + ry * 22), width: '9px', height: '12px', background: on ? lit : dim });
          wins.push({ el: wEl, on, flip: 1.5 + r() * 5, ph: r() * 6 });
        }
      }
      x += bw + (sp.gap != null ? sp.gap : 4);
    }
    return {
      node, w: Wd, h: Hm, anchor: 'b',
      update(lt) {
        if (sp.twinkle === false) return;
        wins.forEach((w) => {
          const on = w.on !== (Math.floor((lt + w.ph) / w.flip) % 4 === 3);
          w.el.style.background = on ? lit : dim;
        });
      },
    };
  };

  B.building = (sp, ctx) => {
    const w = sp.w || 220, h = sp.h || 420, cols = sp.cols || 3, rows = sp.rows || 6;
    const r = ctx.rng(sp.seed || 'b' + ctx.idx);
    const node = PM.div('', { position: 'relative', width: px(w), height: px(h) });
    put(node, { w, h, color: sp.color || '#C77B54', j: 1.4 });
    put(node, { w: w + 14, h: 16, x: -7, y: -8, color: shade(sp.color || '#C77B54', .85), j: 1 });
    const gx = 18, gy = 22, cw = (w - gx * 2) / cols, ch = (h - gy * 2) / rows;
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const lit = r() < (sp.lit == null ? 0.25 : sp.lit);
      const win = put(node, { w: cw - 14, h: ch - 14, x: gx + j * cw + 7, y: gy + i * ch + 7, color: lit ? (sp.litColor || '#F5C65B') : (sp.glass || '#8EC5E8'), shadow: false, j: .6 });
      box(win, { left: '50%', top: '0', width: '2px', height: '100%', background: 'rgba(255,255,255,.55)' });
      box(win, { left: '0', top: '50%', width: '100%', height: '2px', background: 'rgba(255,255,255,.55)' });
    }
    return { node, w, h, anchor: 'b' };
  };

  B.moon = (sp, ctx) => {
    const D = sp.size || 120;
    const node = PM.div('', { position: 'relative', width: px(D), height: px(D) });
    box(node, { left: px(-D * .5), top: px(-D * .5), width: px(D * 2), height: px(D * 2), borderRadius: '50%', background: 'radial-gradient(circle,rgba(255,244,210,.35),transparent 62%)' });
    const m = put(node, { w: D, h: D, edge: 'circle', color: sp.color || '#F4EBCB', shadow: 'soft' });
    [[.22, .3, .2], [.58, .55, .26], [.4, .75, .12]].forEach(([a, b, c]) => box(m, { left: px(a * D), top: px(b * D), width: px(c * D), height: px(c * D), borderRadius: '50%', background: 'rgba(160,140,100,.28)' }));
    return { node, w: D, h: D };
  };

  B.cloud = (sp, ctx) => {
    const w = sp.w || 260, h = w * .46, c = sp.color || '#F1D9C2';
    const node = PM.div('', { position: 'relative', width: px(w), height: px(h), filter: 'drop-shadow(2px 5px 4px rgba(0,0,0,.28))' });
    [[0, .35, .42], [.22, .05, .5], [.5, .15, .46], [.66, .38, .34]].forEach(([a, b, s]) => put(node, { w: w * s, h: w * s, x: a * w, y: b * h, edge: 'circle', color: c, shadow: false, bevel: false }));
    put(node, { w: w * .85, h: h * .45, x: w * .08, y: h * .55, color: c, shadow: false, bevel: false, edge: 'round', radius: 20 });
    return { node, w, h };
  };

  // ---------------------------------------------------------------- meter / stamp / list
  B.meter = (sp, ctx) => {
    const w = sp.w || 400, h = sp.h || 104;
    const node = PM.div('', { position: 'relative', width: px(w), height: px(h) });
    put(node, { w, h, color: sp.color || '#15171C', edge: 'round', radius: 12, bevel: false });
    text(node, sp.label || 'Usage', { font: 'ui', size: 22, weight: 800, color: '#EDE7D8', x: 22, y: 16 });
    const pct = text(node, '0%', { font: 'ui', size: 22, weight: 800, color: '#EDE7D8', w: w - 44, x: 22, y: 16, align: 'right' });
    box(node, { left: '22px', top: px(h - 40), width: px(w - 44), height: '20px', borderRadius: '10px', background: '#2A2E37' });
    const fill = box(node, { left: '22px', top: px(h - 40), width: '0px', height: '20px', borderRadius: '10px', background: sp.fill || 'linear-gradient(#3EBE6B,#2E9A55)' });
    return {
      node, w, h,
      update(lt) {
        const v = PM.val(sp.value, lt, 0.5);
        fill.style.width = px((w - 44) * clamp(v));
        pct.textContent = Math.round(v * 100) + '%';
        if (sp.warn != null && v > sp.warn) fill.style.background = 'linear-gradient(#F2B632,#E58B22)';
      },
    };
  };

  B.stamp = (sp, ctx) => {
    const str = sp.text || 'DONE', c = sp.color || '#2E9A55', size = sp.size || 46;
    const w = str.length * size * .66 + 50, h = size * 1.55;
    const node = PM.div('', { position: 'relative', width: px(w), height: px(h), opacity: .92 });
    box(node, { left: '0', top: '0', width: px(w), height: px(h), border: '5px solid ' + c, borderRadius: '10px' });
    box(node, { left: '8px', top: '8px', width: px(w - 16), height: px(h - 16), border: '2px solid ' + c, borderRadius: '6px' });
    text(node, str, { font: 'title', size, weight: 400, color: c, w, h, center: true, ls: .06 });
    node.style.mixBlendMode = 'multiply';
    return { node, w, h };
  };

  B.list = (sp, ctx) => {
    const rows = sp.rows || [], w = sp.w || 300, rh = sp.rowH || 52;
    const h = (sp.header === false ? 20 : 66) + rows.length * rh + 14;
    const node = PM.div('', { position: 'relative', width: px(w), height: px(h) });
    put(node, { w, h, color: '#F6EEDD', j: 1.4 });
    if (sp.title) text(node, sp.title, { font: 'banner', size: 20, color: '#1E1C1A', x: 18, y: 20, upper: true, ls: .01 });
    if (sp.title) box(node, { left: '14px', top: '52px', width: px(w - 28), height: '2px', background: '#1E1C1A' });
    const els = rows.map((r, i) => {
      const row = box(node, { left: '0', top: px(66 + i * rh), width: px(w), height: px(rh) });
      box(row, { left: '18px', top: px(rh / 2 - 17), width: '34px', height: '34px', borderRadius: '50%', background: r.color || '#2AA6A6', boxShadow: 'inset -3px -3px 0 rgba(0,0,0,.18)' });
      text(row, r.label, { font: 'banner', size: 20, color: '#1E1C1A', x: 66, y: rh / 2 - 11 });
      if (r.note) text(row, r.note, { font: 'ui', size: 15, weight: 700, color: '#6b6258', x: 66, y: rh / 2 + 8 });
      else box(row, { left: '66px', top: px(rh / 2 + 10), width: px(w - 100 - (i % 3) * 30), height: '7px', borderRadius: '4px', background: '#E3DACA' });
      return row;
    });
    return {
      node, w, h,
      update(lt) {
        const at = sp.at || 0, st = sp.stagger != null ? sp.stagger : 0.3;
        els.forEach((e, i) => {
          const p = clamp((lt - at - i * st) / 0.3);
          e.style.opacity = p; e.style.transform = 'translateX(' + (1 - PM.E.outCubic(p)) * 40 + 'px)';
        });
      },
    };
  };

  // ---------------------------------------------------------------- free shapes / text / bubbles
  B.shape = (sp, ctx) => {
    const w = sp.w || 160, h = sp.h || w, kind = sp.kind || 'rect';
    const node = PM.div('', { position: 'relative', width: px(w), height: px(h) });
    const polys = {
      tri: 'polygon(50% 0,100% 100%,0 100%)', diamond: 'polygon(50% 0,100% 50%,50% 100%,0 50%)',
      arrow: 'polygon(0 30%,60% 30%,60% 0,100% 50%,60% 100%,60% 70%,0 70%)',
      star: 'polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)',
      blob: 'polygon(10% 20%,40% 2%,78% 8%,98% 38%,90% 78%,58% 98%,20% 90%,2% 55%)',
    };
    const o = { w, h, color: sp.color || '#E5835A', tex: sp.tex, shadow: sp.shadow, bevel: sp.bevel };
    if (polys[kind]) { o.edge = 'poly'; o.poly = polys[kind]; }
    else if (kind === 'circle') o.edge = 'circle';
    else if (kind === 'pill') { o.edge = 'round'; o.radius = h / 2; }
    else if (kind === 'round') { o.edge = 'round'; o.radius = sp.radius || 14; }
    else { o.edge = 'cut'; o.j = sp.j; }
    const p = put(node, o);
    if (sp.text) text(node, sp.text, { font: sp.font || 'banner', size: sp.size || 26, color: sp.ink || '#1E1C1A', w, h, center: true, upper: sp.upper });
    return { node, w, h };
  };

  B.text = (sp, ctx) => {
    const t = PM.div('txt');
    t.textContent = sp.text || '';
    const fam = { banner: 'var(--f-banner)', cap: 'var(--f-cap)', title: 'var(--f-title)', mono: 'var(--f-mono)', ui: 'var(--f-ui)' }[sp.font || 'title'];
    Object.assign(t.style, { position: 'relative', fontFamily: fam, fontSize: (sp.size || 90) + 'px', fontWeight: sp.weight || (sp.font === 'title' || !sp.font ? 400 : 800), color: sp.color || '#F6EEDD', unicodeBidi: 'plaintext',
      letterSpacing: (sp.ls == null ? 0.02 : sp.ls) + 'em', textTransform: sp.upper === false ? 'none' : (sp.font === 'title' || !sp.font ? 'uppercase' : 'none'), textAlign: sp.align || 'center' });
    if (sp.w) { t.style.width = sp.w + 'px'; t.style.whiteSpace = 'pre-wrap'; t.style.lineHeight = String(sp.lh || 1.05); }
    if (sp.outline) t.style.webkitTextStroke = sp.outline;
    t.style.textShadow = sp.shadow === false ? 'none' : '3px 5px 0 rgba(0,0,0,.28)';
    const m = PM.measure(t.cloneNode(true));
    const pad = sp.paper ? 26 : 0;
    const node = PM.div('', { position: 'relative', width: px(m.w + pad * 2), height: px(m.h + pad) });
    if (sp.paper) { put(node, { w: m.w + pad * 2, h: m.h + pad, color: sp.paper === true ? '#F6EEDD' : sp.paper, j: 1.4 }); t.style.left = pad + 'px'; t.style.top = pad / 2 + 'px'; t.style.textShadow = 'none'; }
    t.style.position = 'absolute';
    node.appendChild(t);
    return { node, w: m.w + pad * 2, h: m.h + pad };
  };

  B.bubble = (sp, ctx) => {
    const w = sp.w || 190, h = sp.h || 84, thought = sp.kind === 'thought';
    const node = PM.div('', { position: 'relative', width: px(w), height: px(h + 26) });
    put(node, { w, h, color: '#FBF7EE', edge: 'round', radius: thought ? h / 2 : 18, bevel: false });
    if (thought) {
      [[w * .2, h + 4, 14], [w * .13, h + 18, 9]].forEach(([x, y, d]) => put(node, { w: d, h: d, x, y, edge: 'circle', color: '#FBF7EE', bevel: false }));
    } else {
      put(node, { w: 28, h: 28, x: w * (sp.tail === 'r' ? .68 : .2), y: h - 10, edge: 'poly', poly: 'polygon(0 0,100% 0,30% 100%)', color: '#FBF7EE', shadow: false, bevel: false });
    }
    text(node, sp.text || '...', { font: 'cap', size: sp.size || 25, weight: 700, color: '#2A2622', w, h, center: true });
    return { node, w, h: h + 26 };
  };

  B.burst = (sp, ctx) => {
    const D = sp.size || 120, n = sp.points || 10, inner = sp.inner || 0.55;
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
      const a = (Math.PI * i) / n - Math.PI / 2, r = i % 2 ? inner : 1;
      pts.push((50 + Math.cos(a) * 50 * r).toFixed(1) + '% ' + (50 + Math.sin(a) * 50 * r).toFixed(1) + '%');
    }
    const node = PM.div('', { position: 'relative', width: px(D), height: px(D) });
    put(node, { w: D, h: D, edge: 'poly', poly: 'polygon(' + pts.join(',') + ')', color: sp.color || '#F6D04D' });
    if (sp.text) text(node, sp.text, { font: 'title', size: D * .26, weight: 400, color: sp.ink || '#1E1C1A', w: D, h: D, center: true });
    return { node, w: D, h: D };
  };

  B.sparkles = (sp, ctx) => {
    const n = sp.count || 12, R = sp.radius || 120, life = sp.life || 1.1, c = sp.color || '#F6D04D';
    const r = ctx.rng(sp.seed || 'sp' + ctx.idx);
    const node = PM.div('', { position: 'relative', width: '2px', height: '2px' });
    const ps = [];
    for (let i = 0; i < n; i++) {
      const s = 8 + r() * 14;
      const e = box(node, { left: px(-s / 2), top: px(-s / 2), width: px(s), height: px(s), background: Array.isArray(sp.colors) ? sp.colors[i % sp.colors.length] : c,
        clipPath: sp.shape === 'rect' ? 'none' : 'polygon(50% 0,62% 38%,100% 50%,62% 62%,50% 100%,38% 62%,0 50%,38% 38%)' });
      ps.push({ e, a: r() * Math.PI * 2, d: .5 + r() * .5, off: r() * life, spin: (r() - .5) * 400 });
    }
    return {
      node, w: 2, h: 2,
      update(lt) {
        const at = sp.at || 0;
        ps.forEach((p) => {
          let k = (lt - at - (sp.loop ? p.off : 0));
          if (k < 0) { p.e.style.opacity = 0; return; }
          if (sp.loop) k = k % life; else if (k > life) { p.e.style.opacity = 0; return; }
          const q = k / life, d = PM.E.outCubic(q) * R * p.d;
          p.e.style.opacity = 1 - q * q;
          p.e.style.transform = 'translate(' + Math.cos(p.a) * d + 'px,' + (Math.sin(p.a) * d + q * q * 30) + 'px) rotate(' + p.spin * q + 'deg) scale(' + (1 - q * .5) + ')';
        });
      },
    };
  };

  B.image = (sp, ctx) => {
    const w = sp.w || 200, h = sp.h || 200;
    const node = PM.div('', { position: 'relative', width: px(w), height: px(h) });
    const pad = sp.frame === false ? 0 : (sp.pad == null ? 10 : sp.pad);
    if (pad) put(node, { w, h, color: sp.color || '#F6EEDD', j: 1.2 });
    const img = document.createElement('img');
    img.src = sp.src;
    Object.assign(img.style, { position: 'absolute', left: px(pad), top: px(pad), width: px(w - pad * 2), height: px(h - pad * 2), objectFit: sp.fit || 'contain' });
    node.appendChild(img);
    return { node, w, h };
  };

  B.svg = (sp) => {
    const w = sp.w || 200, h = sp.h || 200;
    const node = PM.div('', { position: 'relative', width: px(w), height: px(h) });
    node.innerHTML = sp.svg;
    return { node, w, h };
  };
  B.html = (sp) => {
    const w = sp.w || 200, h = sp.h || 200;
    const node = PM.div('', { position: 'relative', width: px(w), height: px(h) });
    node.innerHTML = sp.html;
    return { node, w, h };
  };
})();
