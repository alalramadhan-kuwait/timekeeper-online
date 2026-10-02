/* paper-motion documentary props: watch, map, photo, social post, phone, door, mic, box, puppet and more.
 * Same builder contract as props.js. Palette defaults are monochrome (ink, bone, steel) so a brand
 * can drive colour from the storyboard. */
(function () {
  'use strict';
  const PM = window.PM, B = PM.builders, { clamp, lerp, rng, hash } = PM.util, E = PM.E;
  const px = (n) => n.toFixed(1) + 'px';
  const INK = '#121212', BONE = '#EEEAE0', STEEL = '#BCC0C7', GRAPH = '#3A3D44';
  const put = (parent, o) => { const p = PM.piece(o); parent.appendChild(p); return p; };
  const box = (parent, style) => { const d = PM.div('', Object.assign({ position: 'absolute' }, style)); parent.appendChild(d); return d; };
  const FONT = { banner: 'var(--f-banner)', cap: 'var(--f-cap)', title: 'var(--f-title)', mono: 'var(--f-mono)', ui: 'var(--f-ui)' };
  function text(parent, str, o) {
    const d = PM.div('txt');
    d.textContent = str;
    Object.assign(d.style, { fontFamily: FONT[o.font || 'ui'], fontSize: (o.size || 22) + 'px', fontWeight: o.weight || 800, color: o.color || INK,
      left: (o.x || 0) + 'px', top: (o.y || 0) + 'px', unicodeBidi: 'plaintext', lineHeight: String(o.lh || 1.15) });
    if (o.w) { d.style.width = o.w + 'px'; d.style.whiteSpace = 'pre-wrap'; }
    if (o.h) d.style.height = o.h + 'px';
    if (o.align) d.style.textAlign = o.align;
    if (o.center) { d.style.display = 'flex'; d.style.alignItems = 'center'; d.style.justifyContent = 'center'; d.style.textAlign = 'center'; }
    if (o.ls != null) d.style.letterSpacing = o.ls + 'em';
    parent.appendChild(d);
    return d;
  }
  const shade = (hex, k) => {
    const n = parseInt(hex.slice(1), 16), f = (v) => Math.round(clamp(v * k, 0, 255));
    return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('');
  };
  const rot = (el, deg, origin) => { el.style.transformOrigin = origin || '50% 50%'; el.style.transform = 'rotate(' + deg + 'deg)'; };

  // ------------------------------------------------------------------ watch
  B.watch = (sp, ctx) => {
    const D = sp.size || 300, R = D * 0.4, cx = D / 2, H = D * (sp.strap === false ? 1 : 1.9), cy = H / 2;
    const caseC = sp.caseColor || STEEL, dialC = sp.dialColor || '#F1EEE6', strapC = sp.strapColor || '#1B1B1D', handC = sp.handColor || INK, markC = sp.markerColor || INK;
    const node = PM.div('', { position: 'relative', width: px(D), height: px(H) });
    const parts = [];
    const part = (name, order, vx, vy, vr) => { const el = box(node, { left: '0', top: '0', width: px(D), height: px(H) }); parts.push({ name, el, order, vx, vy, vr }); return el; };
    if (sp.strap !== false) {
      const sb = part('strapB', 0, 0, 1.0, 6), st = part('strapT', 1, 0, -1.0, -6);
      for (const [h, up] of [[st, true], [sb, false]]) {
        const p = put(h, { w: D * 0.4, h: D * 0.78, x: cx - D * 0.2, y: up ? cy - R - D * 0.7 : cy + R - D * 0.08, color: strapC, tex: 'card', j: 1 });
        p._cut.style.backgroundColor = strapC;
        for (let i = 0; i < 2; i++) box(p, { left: px(D * 0.015 + i * D * 0.37), top: '6px', width: '0', height: 'calc(100% - 12px)', borderLeft: '2px dashed rgba(255,255,255,.35)' });
        if (!up) for (let i = 0; i < 3; i++) box(p, { left: px(D * 0.17), top: px(D * 0.25 + i * D * 0.11), width: px(D * 0.06), height: px(D * 0.06), borderRadius: '50%', background: 'rgba(0,0,0,.55)' });
      }
    }
    const lugs = part('lugs', 2, 0, 0, 0);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) put(lugs, { w: D * 0.09, h: D * 0.13, x: cx + sx * R * 0.68 - D * 0.045, y: cy + sy * R * 0.9 - D * 0.065, color: shade(caseC, 0.92), j: .8 });
    const cs = part('case', 3, -0.35, 0.0, -8);
    put(cs, { w: R * 2, h: R * 2, x: cx - R, y: cy - R, edge: 'circle', color: caseC, shadow: 'soft' });
    box(cs, { left: px(cx - R * .93), top: px(cy - R * .93), width: px(R * 1.86), height: px(R * 1.86), borderRadius: '50%', border: px(R * .08) + ' solid ' + shade(caseC, .8) });
    const cr = part('crown', 4, 0.9, 0, 12);
    put(cr, { w: D * 0.07, h: D * 0.1, x: cx + R - 2, y: cy - D * 0.05, color: shade(caseC, .85), j: .6 });
    for (let i = 0; i < 4; i++) box(cr, { left: px(cx + R + 3 + i * 3), top: px(cy - D * 0.05 + 3), width: '1px', height: px(D * 0.1 - 6), background: 'rgba(0,0,0,.35)' });
    const dl = part('dial', 5, 0.0, -0.45, 0);
    put(dl, { w: R * 1.72, h: R * 1.72, x: cx - R * .86, y: cy - R * .86, edge: 'circle', color: dialC, bevel: false, shadow: false });
    const rr = ctx.rng('dial' + (sp.id || ''));
    if (sp.guilloche !== false) {
      const g = box(dl, { left: px(cx - R * .86), top: px(cy - R * .86), width: px(R * 1.72), height: px(R * 1.72), borderRadius: '50%',
        background: 'repeating-radial-gradient(circle at 50% 50%,rgba(0,0,0,.07) 0 1px,transparent 1px 5px)', opacity: .8 });
    }
    const mk = part('markers', 6, 0, -0.3, 0);
    for (let i = 0; i < 12; i++) {
      const h = box(mk, { left: px(cx), top: px(cy), width: '0', height: '0', transform: 'rotate(' + i * 30 + 'deg)' });
      const big = i % 3 === 0;
      box(h, { left: px(-(big ? 4 : 2.5)), top: px(-R * .78), width: px(big ? 8 : 5), height: px(R * (big ? .2 : .12)), background: markC });
    }
    if (sp.numerals === 'arabic') {
      [['١٢', 0], ['٣', 90], ['٦', 180], ['٩', 270]].forEach(([n, a]) => {
        const x = cx + Math.sin(a * Math.PI / 180) * R * .52, y = cy - Math.cos(a * Math.PI / 180) * R * .52;
        const t = text(mk, n, { font: 'banner', size: R * .3, color: markC, w: R, x: x - R / 2, y: y - R * .16, center: true });
      });
    }
    if (sp.date !== false) {
      box(mk, { left: px(cx + R * .42), top: px(cy - R * .09), width: px(R * .26), height: px(R * .18), background: '#fff', border: '1px solid #222' });
      text(mk, String(sp.dateText || '12'), { font: 'ui', size: R * .13, w: R * .26, x: cx + R * .42, y: cy - R * .09, h: R * .18, center: true });
    }
    if (sp.brand) text(mk, sp.brand, { font: 'banner', size: R * .1, w: R * 1.2, x: cx - R * .6, y: cy - R * .46, center: true, ls: .2, color: markC });
    const hs = part('hands', 7, 0, -0.9, 0);
    const mkHand = (len, wd, c, tail) => { const h = box(hs, { left: px(cx), top: px(cy), width: '0', height: '0' }); const b = box(h, { left: px(-wd / 2), top: px(-len), width: px(wd), height: px(len + tail), background: c, clipPath: 'polygon(50% 0,100% 12%,100% 100%,0 100%,0 12%)', filter: 'drop-shadow(1px 2px 1px rgba(0,0,0,.35))' }); return h; };
    const hh = mkHand(R * .5, 9, handC, 10), mh = mkHand(R * .72, 7, handC, 10), sh = mkHand(R * .78, 2.5, sp.secondColor || '#B3261E', R * .16);
    box(hs, { left: px(cx - 6), top: px(cy - 6), width: '12px', height: '12px', borderRadius: '50%', background: handC });
    const glass = box(node, { left: px(cx - R * .86), top: px(cy - R * .86), width: px(R * 1.72), height: px(R * 1.72), borderRadius: '50%', background: 'linear-gradient(135deg,rgba(255,255,255,.28) 0%,rgba(255,255,255,0) 40%)', pointerEvents: 'none' });
    parts.push({ name: 'glass', el: glass, order: 8, vx: 0, vy: -0.6, vr: 0 });
    return {
      node, w: D, h: H,
      update(lt) {
        const base = sp.time || [10, 10, 0];
        const t0 = ((base[0] % 12) * 3600 + (base[1] || 0) * 60 + (base[2] || 0)), t = t0 + lt * (sp.rate || 1);
        const sec = sp.tick === false ? t : Math.floor(t * 8) / 8; // an 8 beats-per-second escapement
        rot(sh, (sec % 60) * 6, '0 0'); rot(mh, ((t / 60) % 60) * 6, '0 0'); rot(hh, ((t / 3600) % 12) * 30, '0 0');
        const as = sp.assemble, ex = PM.val(sp.explode, lt, 0);
        parts.forEach((p) => {
          let f = ex, vis = true;
          if (as) { const pr = clamp((lt - (as.at || 0) - p.order * (as.stagger != null ? as.stagger : 0.18)) / (as.dur || 0.55)); vis = pr > 0; f = clamp(Math.max(f, 1 - E.outBack(pr))); if (pr === 0) f = 1; }
          p.el.style.visibility = vis ? 'visible' : 'hidden';
          p.el.style.transform = 'translate(' + px(p.vx * D * f * 0.9) + ',' + px(p.vy * D * f * 0.9) + ') rotate(' + (p.vr * f).toFixed(2) + 'deg)';
          p.el.style.opacity = as ? clamp(1 - (f > 0.98 ? 1 : 0)) : 1;
        });
      },
    };
  };

  // ------------------------------------------------------------------ map (real country outlines)
  let GEO = null;
  function geo() {
    if (GEO) return GEO;
    const x = new XMLHttpRequest();
    x.open('GET', '../assets/geo/world.json', false); // synchronous: the file is local and ~400 KB
    x.send();
    GEO = JSON.parse(x.responseText);
    return GEO;
  }
  const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (Math.max(-80, Math.min(84, lat)) * Math.PI) / 360));
  function viewAt(keys, lt) {
    if (!Array.isArray(keys)) return keys;
    if (lt <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      if (lt <= keys[i][0]) {
        const a = keys[i - 1], b = keys[i], p = (E[b[2]] || E.inOutCubic)(clamp((lt - a[0]) / (b[0] - a[0] || 1e-9)));
        return { lon: lerp(a[1].lon, b[1].lon, p), lat: lerp(a[1].lat, b[1].lat, p), span: Math.exp(lerp(Math.log(a[1].span), Math.log(b[1].span), p)) };
      }
    }
    return keys[keys.length - 1][1];
  }
  B.map = (sp, ctx) => {
    const w = sp.w || 640, h = sp.h || 760, data = geo();
    const sea = sp.sea || '#D7D2C4', land = sp.land || '#F4F1E8', ink = sp.ink || INK;
    const node = PM.div('', { position: 'relative', width: px(w), height: px(h) });
    const sheet = put(node, { w, h, color: sea, j: 1.2, shadow: 'soft' });
    const clip = box(node, { left: '0', top: '0', width: px(w), height: px(h), overflow: 'hidden', clipPath: ctx.cutPoly(w, h, 1.2, 77) });
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', w); svg.setAttribute('height', h); svg.style.position = 'absolute'; svg.style.left = '0'; svg.style.top = '0';
    const gGrat = document.createElementNS(NS, 'g'), gLand = document.createElementNS(NS, 'g'), gRoute = document.createElementNS(NS, 'g');
    gLand.style.filter = 'drop-shadow(1.5px 3px 2px rgba(0,0,0,.30))';
    svg.append(gGrat, gLand, gRoute); clip.appendChild(svg);
    const paths = data.countries.map((c) => { const p = document.createElementNS(NS, 'path'); p.setAttribute('fill', land); p.setAttribute('stroke', 'rgba(0,0,0,.18)'); p.setAttribute('stroke-width', '0.8'); gLand.appendChild(p); return { c, p }; });
    const spaths = sp.states ? data.states.map((c) => { const p = document.createElementNS(NS, 'path'); p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'rgba(0,0,0,.28)'); p.setAttribute('stroke-width', '0.7'); gLand.appendChild(p); return { c, p }; }) : [];
    const hl = (sp.highlight || []).map((x) => (typeof x === 'string' ? { n: x } : x));
    const pins = (sp.pins || []).map((pn) => {
      const el = box(node, { left: '0', top: '0', width: '0', height: '0', zIndex: 5 });
      box(el, { left: '-1px', top: '-30px', width: '2px', height: '30px', background: ink });
      box(el, { left: '-9px', top: '-46px', width: '18px', height: '18px', borderRadius: '50%', background: pn.color || ink, boxShadow: '1px 3px 3px rgba(0,0,0,.4), inset -3px -3px 0 rgba(0,0,0,.25)' });
      const lab = put(el, { w: 10 + (pn.label || '').length * 11, h: 30, x: 14, y: -64, color: '#F6F2E8', j: .8, bevel: false });
      text(lab, pn.label || '', { font: 'banner', size: 15, w: 10 + (pn.label || '').length * 11, h: 30, center: true, ls: .04 });
      return { pn, el };
    });
    const routes = (sp.routes || []).map((r) => {
      const trail = document.createElementNS(NS, 'path'); trail.setAttribute('fill', 'none'); trail.setAttribute('stroke', r.color || ink); trail.setAttribute('stroke-width', '3'); trail.setAttribute('stroke-dasharray', '2 9'); trail.setAttribute('stroke-linecap', 'round'); gRoute.appendChild(trail);
      const pl = box(node, { left: '0', top: '0', width: '0', height: '0', zIndex: 6, display: 'none' });
      const sh = box(pl, { left: '-16px', top: '-10px', width: '34px', height: '22px', background: 'rgba(0,0,0,.25)', clipPath: 'polygon(0 50%,100% 0,70% 50%,100% 100%)', transform: 'translate(8px,14px)' });
      box(pl, { left: '-16px', top: '-10px', width: '34px', height: '22px', background: r.planeColor || '#FBF8F0', clipPath: 'polygon(0 50%,100% 0,70% 50%,100% 100%)', filter: 'drop-shadow(0 0 1px rgba(0,0,0,.6))' });
      box(pl, { left: '-16px', top: '-1px', width: '24px', height: '2px', background: 'rgba(0,0,0,.25)' });
      return { r, trail, pl };
    });
    const find = (id) => (sp.pins || []).find((p) => p.id === id) || { lon: 0, lat: 0 };
    const unf = sp.unfold;
    const flap = unf ? box(node, { left: '0', top: '0', width: '60px', height: px(h), zIndex: 9, background: 'linear-gradient(90deg,rgba(0,0,0,0),rgba(0,0,0,.22),rgba(255,255,255,.25))', pointerEvents: 'none' }) : null;
    return {
      node, w, h,
      update(lt) {
        const v = viewAt(sp.view || { lon: 0, lat: 20, span: 360 }, lt);
        const k = w / (v.span * Math.PI / 180), my0 = mercY(v.lat);
        const X = (lon) => w / 2 + (lon - v.lon) * Math.PI / 180 * k;
        const Y = (lat) => h / 2 - (mercY(lat) - my0) * k;
        const lonSpan = v.span, latSpan = v.span * h / w * 0.9;
        const draw = (c, p) => {
          let d = '';
          for (const r of c.r) {
            let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9, s = '';
            for (let i = 0; i < r.length; i += 2) {
              const x = X(r[i]), y = Y(r[i + 1]);
              if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
              s += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
            }
            if (maxx < -20 || minx > w + 20 || maxy < -20 || miny > h + 20) continue;
            d += s + 'Z';
          }
          p.setAttribute('d', d);
        };
        paths.forEach(({ c, p }) => {
          draw(c, p);
          const hh = hl.find((x) => x.n === c.n);
          p.setAttribute('fill', hh && lt >= (hh.at || 0) ? (hh.color || ink) : land);
        });
        spaths.forEach(({ c, p }) => draw(c, p));
        // graticule
        if (v.span < 120 || sp.graticule) {
          const step = v.span > 60 ? 10 : v.span > 20 ? 5 : 1; let d = '';
          for (let lo = Math.ceil((v.lon - lonSpan) / step) * step; lo < v.lon + lonSpan; lo += step) d += 'M' + X(lo).toFixed(1) + ' 0L' + X(lo).toFixed(1) + ' ' + h;
          for (let la = Math.ceil((v.lat - latSpan) / step) * step; la < v.lat + latSpan; la += step) d += 'M0 ' + Y(la).toFixed(1) + 'L' + w + ' ' + Y(la).toFixed(1);
          if (!gGrat._p) { gGrat._p = document.createElementNS(NS, 'path'); gGrat._p.setAttribute('stroke', 'rgba(0,0,0,.10)'); gGrat._p.setAttribute('fill', 'none'); gGrat._p.setAttribute('stroke-width', '0.8'); gGrat.appendChild(gGrat._p); }
          gGrat._p.setAttribute('d', d);
        }
        pins.forEach(({ pn, el }) => {
          const at = pn.at || 0, p = clamp((lt - at) / 0.45);
          el.style.display = lt < at ? 'none' : '';
          el.style.transform = 'translate(' + px(X(pn.lon)) + ',' + px(Y(pn.lat) - (1 - E.outBounce(p)) * 120) + ')';
        });
        routes.forEach(({ r, trail, pl }) => {
          const a = find(r.from), b = find(r.to);
          const ax = X(a.lon), ay = Y(a.lat), bx = X(b.lon), by = Y(b.lat);
          const mx = (ax + bx) / 2 - (by - ay) * (r.curve != null ? r.curve : 0.18), my = (ay + by) / 2 + (bx - ax) * (r.curve != null ? r.curve : 0.18);
          const p = clamp((lt - (r.at || 0)) / (r.dur || 1.4)), q = E.inOutCubic(p);
          const pt = (u) => [(1 - u) * (1 - u) * ax + 2 * (1 - u) * u * mx + u * u * bx, (1 - u) * (1 - u) * ay + 2 * (1 - u) * u * my + u * u * by];
          let d = ''; const n = 36;
          for (let i = 0; i <= n * q; i++) { const [x, y] = pt(i / n); d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); }
          trail.setAttribute('d', q > 0 ? d : '');
          if (r.plane !== false && lt >= (r.at || 0) && (p < 1 || r.keep)) {
            const [x, y] = pt(q), [x2, y2] = pt(Math.min(1, q + 0.01)), ang = Math.atan2(y2 - y, x2 - x) * 180 / Math.PI;
            pl.style.display = ''; pl.style.transform = 'translate(' + px(x) + ',' + px(y) + ') rotate(' + ang + 'deg) scale(' + (1 + Math.sin(Math.PI * q) * 0.5) + ')';
          } else pl.style.display = 'none';
        });
        if (unf) {
          const p = clamp((lt - (unf.at || 0)) / (unf.dur || 1.2)), q = E.inOutCubic(p);
          const edge = q * w;
          clip.style.clipPath = 'inset(0 ' + px(w - edge) + ' 0 0)';
          sheet.style.clipPath = 'inset(0 ' + px(w - edge) + ' 0 0)'; sheet.style.filter = 'none';
          flap.style.display = p < 1 ? '' : 'none'; flap.style.left = px(edge - 40);
          node.style.setProperty('--unf', q);
        }
      },
    };
  };

  // ------------------------------------------------------------------ photo (real evidence, or a loud placeholder)
  B.photo = (sp, ctx) => {
    if (sp.src) return B.image(Object.assign({ polaroid: true }, sp), ctx);
    const w = sp.w || 520, aspect = sp.aspect || 1.5, pad = 14, bottom = 58, ih = Math.round((w - pad * 2) / aspect), h = ih + pad + bottom;
    const node = PM.div('', { position: 'relative', width: px(w), height: px(h) });
    put(node, { w, h, color: '#F4F1E8', j: 1.2 });
    const ph = box(node, { left: px(pad), top: px(pad), width: px(w - pad * 2), height: px(ih), background: 'repeating-linear-gradient(135deg,#D6D1C4 0 14px,#E3DFD3 14px 28px)', border: '2px dashed #8B857A' });
    text(ph, 'REAL PHOTO NEEDED', { font: 'mono', size: 17, color: '#B3261E', w: w - pad * 2, y: ih / 2 - 52, center: true, weight: 700 });
    text(ph, sp.desc || sp.label || '', { font: 'ui', size: 22, color: '#2A2A2A', w: w - pad * 2 - 40, x: 20, y: ih / 2 - 20, center: true, lh: 1.25 });
    text(ph, sp.asset || '', { font: 'mono', size: 14, color: '#6A655B', w: w - pad * 2, y: ih - 28, center: true, weight: 500 });
    if (sp.label) text(node, sp.label, { font: 'cap', size: sp.labelSize || 24, w, h: bottom, y: h - bottom, center: true, color: '#2A2622' });
    put(node, { w: 84, h: 30, x: w / 2 - 42, y: -15, color: 'rgb(200,196,186)', rot: -3, j: .8, bevel: false });
    return { node, w, h };
  };

  // ------------------------------------------------------------------ social post card (generic, not a platform clone)
  B.igpost = (sp, ctx) => {
    const w = sp.w || 380, imgH = sp.imgH || w, captionLines = sp.caption ? 3 : 0;
    const h = 60 + imgH + 54 + (sp.caption ? 74 : 28);
    const node = PM.div('', { position: 'relative', width: px(w), height: px(h) });
    put(node, { w, h, color: '#FBFAF6', j: 1.2 });
    const av = put(node, { w: 38, h: 38, x: 14, y: 11, edge: 'circle', color: sp.avatarColor || '#F0F0EC', shadow: false, bevel: false });
    if (sp.avatar) { const im = document.createElement('img'); im.src = sp.avatar; Object.assign(im.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }); av.appendChild(im); }
    text(node, sp.handle || 'timekeeperkw', { font: 'ui', size: 17, x: 62, y: 14, weight: 800 });
    text(node, sp.sub || '', { font: 'ui', size: 12, x: 62, y: 35, weight: 600, color: '#777' });
    const im = box(node, { left: '0', top: '60px', width: px(w), height: px(imgH), background: sp.empty ? '#ECE9E1' : '#D8D4C8', overflow: 'hidden' });
    if (sp.src) { const i = document.createElement('img'); i.src = sp.src; Object.assign(i.style, { width: '100%', height: '100%', objectFit: sp.fit || 'cover', objectPosition: sp.pos || '50% 50%' }); im.appendChild(i); }
    else if (!sp.empty) { im.style.background = 'repeating-linear-gradient(135deg,#D6D1C4 0 14px,#E3DFD3 14px 28px)'; text(im, 'REAL POST NEEDED', { font: 'mono', size: 15, color: '#B3261E', w, y: imgH / 2 - 40, center: true, weight: 700 }); text(im, sp.desc || '', { font: 'ui', size: 20, color: '#2A2A2A', w: w - 40, x: 20, y: imgH / 2 - 8, center: true }); text(im, sp.asset || '', { font: 'mono', size: 12, color: '#6A655B', w, y: imgH - 26, center: true, weight: 500 }); }
    const ay = 60 + imgH + 14;
    const heart = box(node, { left: '16px', top: px(ay), width: '26px', height: '24px' });
    box(heart, { left: '3px', top: '3px', width: '20px', height: '18px', background: INK, clipPath: 'polygon(50% 100%,0 40%,0 15%,20% 0,50% 18%,80% 0,100% 15%,100% 40%)' });
    box(node, { left: '56px', top: px(ay + 1), width: '22px', height: '22px', borderRadius: '50%', border: '3px solid ' + INK });
    box(node, { left: '96px', top: px(ay + 2), width: '24px', height: '20px', background: INK, clipPath: 'polygon(0 45%,100% 0,70% 100%,52% 62%)' });
    if (sp.caption) text(node, sp.caption, { font: 'ui', size: 17, weight: 700, x: 16, y: ay + 36, w: w - 32, lh: 1.3, align: 'start' });
    else { box(node, { left: '16px', top: px(ay + 40), width: px(w * .62), height: '9px', borderRadius: '5px', background: '#DCD8CD' }); box(node, { left: '16px', top: px(ay + 58), width: px(w * .42), height: '9px', borderRadius: '5px', background: '#E7E4DB' }); }
    return {
      node, w, h,
      update(lt) {
        const la = sp.likeAt;
        if (la != null) { const p = clamp((lt - la) / 0.5); const s = lt < la ? 1 : 1 + Math.sin(Math.PI * p) * 0.5; heart.style.transform = 'scale(' + s + ')'; heart.firstChild.style.background = lt >= la ? '#C8102E' : INK; }
      },
    };
  };

  B.notif = (sp, ctx) => {
    const w = sp.w || 540, h = sp.h || 100;
    const node = PM.div('', { position: 'relative', width: px(w), height: px(h) });
    put(node, { w, h, color: '#FBFAF6', edge: 'round', radius: 22, shadow: 'soft', bevel: false });
    const av = put(node, { w: 54, h: 54, x: sp.rtl === false ? 18 : w - 72, y: h / 2 - 27, edge: 'circle', color: sp.avatarColor || '#CFCBC0', shadow: false, bevel: false });
    text(av, sp.initial || '', { font: 'banner', size: 24, w: 54, h: 54, center: true });
    const tx = sp.rtl === false ? 86 : 22;
    text(node, sp.name || '', { font: 'ui', size: 15, weight: 800, color: '#777', x: tx, y: 14, w: w - 120, align: sp.rtl === false ? 'left' : 'right' });
    text(node, sp.text || '', { font: 'banner', size: sp.size || 24, x: tx, y: 38, w: w - 120, align: sp.rtl === false ? 'left' : 'right', lh: 1.2 });
    return { node, w, h };
  };

  // ------------------------------------------------------------------ phone, door
  B.phone = (sp, ctx) => {
    const w = sp.w || 300, h = sp.h || 600;
    const node = PM.div('', { position: 'relative', width: px(w), height: px(h), transformOrigin: '50% 100%' });
    put(node, { w, h, color: '#17181B', edge: 'round', radius: 40, shadow: 'soft', bevel: false });
    const scr = box(node, { left: '12px', top: '14px', width: px(w - 24), height: px(h - 28), borderRadius: '30px', overflow: 'hidden', background: sp.screen || '#EFECE4' });
    if (sp.src) { const i = document.createElement('img'); i.src = sp.src; Object.assign(i.style, { width: '100%', height: '100%', objectFit: 'cover' }); scr.appendChild(i); }
    else if (sp.label) text(scr, sp.label, { font: 'banner', size: 30, w: w - 24, h: h - 28, center: true });
    box(node, { left: px(w / 2 - 40), top: '20px', width: '80px', height: '22px', borderRadius: '12px', background: '#17181B' });
    return { node, w, h, update(lt) { const f = PM.val(sp.fold, lt, 0); node.style.transform = 'perspective(1100px) rotateX(' + f * 82 + 'deg) scaleY(' + (1 - f * 0.15) + ')'; node.style.opacity = f > 0.97 ? 0 : 1; } };
  };

  B.door = (sp, ctx) => {
    const w = sp.w || 300, h = sp.h || 540;
    const node = PM.div('', { position: 'relative', width: px(w), height: px(h), perspective: '1100px' });
    put(node, { w: w + 36, h: h + 18, x: -18, y: -18, color: '#2B2D32', j: 1 });
    const room = box(node, { left: '0', top: '0', width: px(w), height: px(h), background: sp.interior || 'linear-gradient(#F3E6C8,#CDB98F)', overflow: 'hidden' });
    if (sp.src) { const i = document.createElement('img'); i.src = sp.src; Object.assign(i.style, { width: '100%', height: '100%', objectFit: 'cover' }); room.appendChild(i); }
    else text(room, sp.desc || '', { font: 'ui', size: 20, color: '#333', w: w - 40, x: 20, y: h / 2 - 20, center: true });
    const leaf = box(node, { left: '0', top: '0', width: px(w), height: px(h), transformOrigin: '0 50%', transformStyle: 'preserve-3d' });
    put(leaf, { w, h, color: sp.color || '#1C1D21', tex: 'wood', j: 1 }); leaf.firstChild._cut.style.backgroundColor = sp.color || '#1C1D21';
    for (const [x, y, ww, hh] of [[24, 24, w - 48, h * .42], [24, h * .5, w - 48, h * .42 - 14]]) box(leaf, { left: px(x), top: px(y), width: px(ww), height: px(hh), border: '3px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.04)' });
    box(leaf, { left: px(w - 46), top: px(h * .48), width: '10px', height: '58px', borderRadius: '5px', background: 'linear-gradient(90deg,#C9CCD1,#8E9299)' });
    if (sp.sign) { const pl = put(node, { w: w * 0.9, h: 46, x: w * 0.05, y: -78, color: '#14151A', j: .8, bevel: false }); text(pl, sp.sign, { font: 'banner', size: 20, color: '#EDE9E0', w: w * 0.9, h: 46, center: true, ls: .12 }); }
    return { node, w, h, update(lt) { const o = PM.val(sp.open, lt, 0); leaf.style.transform = 'rotateY(' + (-o * 78) + 'deg)'; leaf.style.filter = 'brightness(' + (1 - o * .25) + ')'; } };
  };

  // ------------------------------------------------------------------ studio mic, sound waves, watch box
  B.mic = (sp, ctx) => {
    const S = sp.size || 1, w = 150 * S, h = 360 * S;
    const node = PM.div('', { position: 'relative', width: px(w), height: px(h) });
    put(node, { w: 14 * S, h: 150 * S, x: w / 2 - 7 * S, y: 150 * S, color: GRAPH, j: .6 });
    put(node, { w: 110 * S, h: 16 * S, x: w / 2 - 55 * S, y: h - 16 * S, color: '#26282D', j: .8 });
    const cap = put(node, { w: 96 * S, h: 160 * S, x: w / 2 - 48 * S, y: 0, edge: 'round', radius: px(48 * S), color: '#25272C', bevel: false });
    box(cap, { left: '0', top: '0', width: '100%', height: '100%', borderRadius: px(48 * S), background: 'repeating-linear-gradient(0deg,rgba(255,255,255,.18) 0 2px,transparent 2px 9px),repeating-linear-gradient(90deg,rgba(255,255,255,.14) 0 2px,transparent 2px 9px)' });
    put(node, { w: 108 * S, h: 12 * S, x: w / 2 - 54 * S, y: 146 * S, color: STEEL, j: .6 });
    return { node, w, h, anchor: 'b' };
  };
  B.waves = (sp, ctx) => {
    const n = sp.bars || 21, bw = sp.barW || 10, gap = sp.gap || 8, H = sp.h || 140, c = sp.color || INK;
    const w = n * (bw + gap), node = PM.div('', { position: 'relative', width: px(w), height: px(H) });
    const bars = [];
    for (let i = 0; i < n; i++) bars.push(put(node, { w: bw, h: H, x: i * (bw + gap), y: 0, color: c, j: .5, bevel: false, shadow: false }));
    const r = rng(sp.seed || 'wave');
    const ph = Array.from({ length: n }, () => r() * 6.28), amp = Array.from({ length: n }, (_, i) => 0.35 + 0.65 * Math.sin(Math.PI * (i + 1) / (n + 1)) * (0.6 + 0.4 * r()));
    return {
      node, w, h: H,
      update(lt) {
        const on = PM.val(sp.level, lt, 1), t = Math.floor(lt * 12) / 12;
        bars.forEach((b, i) => { const v = clamp(0.12 + on * amp[i] * (0.5 + 0.5 * Math.sin(t * 9 + ph[i]))); b.style.transform = 'scaleY(' + v.toFixed(3) + ')'; b.style.transformOrigin = '50% 50%'; });
      },
    };
  };
  B.box = (sp, ctx) => {
    const w = sp.w || 340, h = sp.h || 240, parcel = sp.kind === 'parcel';
    const node = PM.div('', { position: 'relative', width: px(w), height: px(h + 80), perspective: '900px' });
    const body = put(node, { w, h: h * .6, x: 0, y: h * .4 + 40, color: parcel ? '#B58B5E' : '#1E1F23', tex: parcel ? 'card' : 'paper', j: 1 });
    body._cut.style.backgroundColor = parcel ? '#B58B5E' : '#1E1F23';
    const inner = box(node, { left: '12px', top: px(h * .4 + 52), width: px(w - 24), height: px(h * .6 - 24), background: '#F3EEE2', overflow: 'visible' });
    const lidWrap = box(node, { left: '0', top: px(40), width: px(w), height: px(h * .4), transformOrigin: '50% 100%', transformStyle: 'preserve-3d' });
    put(lidWrap, { w, h: h * .4, color: parcel ? '#C29A6C' : '#25262B', j: 1 });
    if (parcel) { box(lidWrap, { left: px(w / 2 - 22), top: '0', width: '44px', height: '100%', background: 'rgba(226,211,176,.85)' }); box(body, { left: px(w / 2 - 22), top: '0', width: '44px', height: '100%', background: 'rgba(226,211,176,.85)' }); const lb = box(body, { left: px(w * .12), top: px(h * .18), width: px(w * .26), height: px(h * .24), background: '#FBFAF6', transform: 'rotate(-3deg)' }); text(lb, sp.label || 'TK', { font: 'mono', size: 13, w: w * .26, h: h * .24, center: true, color: INK }); }
    else text(lidWrap, sp.brand || 'TIME KEEPER', { font: 'banner', size: 20, color: '#E6E1D5', w, h: h * .4, center: true, ls: .3 });
    return { node, w, h: h + 80, update(lt) { const o = PM.val(sp.lid, lt, 0); lidWrap.style.transform = 'rotateX(' + (o * 112) + 'deg)'; inner.style.display = o > 0.02 ? '' : 'none'; lidWrap.lastChild.style.opacity = o > 0.4 ? 0 : 1; } };
  };

  // ------------------------------------------------------------------ small scenery
  B.cup = (sp, ctx) => {
    const S = sp.size || 1, w = 130 * S, h = 120 * S;
    const node = PM.div('', { position: 'relative', width: px(w), height: px(h) });
    put(node, { w: 124 * S, h: 14 * S, x: 3 * S, y: h - 14 * S, edge: 'round', radius: 8, color: '#E9E5DA', j: .5 });
    put(node, { w: 28 * S, h: 38 * S, x: w - 40 * S, y: 38 * S, edge: 'circle', color: '#F2EEE4', shadow: false });
    put(node, { w: 76 * S, h: 66 * S, x: 18 * S, y: h - 78 * S, edge: 'poly', poly: 'polygon(0 0,100% 0,88% 100%,12% 100%)', color: sp.color || '#F6F3EA' });
    put(node, { w: 66 * S, h: 10 * S, x: 23 * S, y: h - 78 * S, edge: 'round', radius: 6, color: '#4B342A', shadow: false, bevel: false });
    const st = []; for (let i = 0; i < 3; i++) st.push(box(node, { left: px(34 * S + i * 18 * S), top: px(h - 120 * S), width: px(5 * S), height: px(38 * S), borderRadius: '5px', background: 'rgba(255,255,255,.55)' }));
    return { node, w, h, anchor: 'b', update(lt) { st.forEach((s, i) => { s.style.transform = 'translateY(' + (Math.sin(lt * 2 + i) * 4) + 'px) scaleY(' + (0.8 + 0.3 * Math.sin(lt * 2.4 + i * 2)) + ')'; s.style.opacity = 0.35 + 0.3 * Math.sin(lt * 2 + i); }); } };
  };
  B.laptop = (sp, ctx) => {
    const w = sp.w || 240, h = w * 0.66;
    const node = PM.div('', { position: 'relative', width: px(w), height: px(h) });
    put(node, { w: w * .86, h: h * .72, x: w * .07, y: 0, color: '#2A2C31', edge: 'round', radius: 8, bevel: false });
    const sc = box(node, { left: px(w * .1), top: px(h * .06), width: px(w * .8), height: px(h * .6), background: sp.screen || '#EDEAE1' });
    if (sp.src) { const i = document.createElement('img'); i.src = sp.src; Object.assign(i.style, { width: '100%', height: '100%', objectFit: 'cover' }); sc.appendChild(i); } else for (let i = 0; i < 5; i++) box(sc, { left: '12px', top: px(14 + i * 20), width: px((w * .8 - 24) * (0.45 + 0.1 * ((i * 7) % 5))), height: '7px', background: '#CFCBC0', borderRadius: '4px' });
    put(node, { w, h: h * .12, x: 0, y: h * .78, color: '#C9CCD1', edge: 'round', radius: 4 });
    return { node, w, h, anchor: 'b' };
  };
  B.towers = (sp, ctx) => {
    const H = sp.h || 420, c = sp.color || '#E7E2D6', node = PM.div('', { position: 'relative', width: px(H * .6), height: px(H) });
    const tw = (x, hh, sph, wd) => {
      put(node, { w: wd, h: hh, x: x - wd / 2, y: H - hh, edge: 'poly', poly: 'polygon(35% 0,65% 0,100% 100%,0 100%)', color: c });
      if (sph) { const s = put(node, { w: sph, h: sph, x: x - sph / 2, y: H - hh * .62, edge: 'circle', color: c }); box(s, { left: '0', top: '0', width: '100%', height: '100%', borderRadius: '50%', background: 'repeating-linear-gradient(0deg,rgba(18,18,18,.55) 0 3px,transparent 3px 9px)' }); put(node, { w: sph * .5, h: sph * .5, x: x - sph * .25, y: H - hh * .62 - sph * .5, edge: 'circle', color: c, shadow: false }); }
    };
    tw(H * .24, H, H * .17, H * .09); tw(H * .46, H * .8, H * .12, H * .07); tw(H * .58, H * .46, 0, H * .045);
    return { node, w: H * .6, h: H, anchor: 'b' };
  };
  B.spotlight = (sp, ctx) => {
    const w = sp.w || 420, h = sp.h || 800, node = PM.div('', { position: 'relative', width: px(w), height: px(h), mixBlendMode: 'screen' });
    box(node, { left: '0', top: '0', width: '100%', height: '100%', clipPath: 'polygon(42% 0,58% 0,100% 100%,0 100%)', background: 'linear-gradient(rgba(255,244,214,.55),rgba(255,244,214,.05))' });
    return { node, w, h, anchor: 't', update(lt) { node.style.opacity = sp.flicker ? 0.85 + 0.15 * Math.sin(lt * 17) : 1; } };
  };

  B.suitcase = (sp, ctx) => {
    const w = sp.w || 150, h = sp.h || 110, c = sp.color || '#2B2D32';
    const node = PM.div('', { position: 'relative', width: px(w), height: px(h + 22) });
    put(node, { w: w * .36, h: 22, x: w * .32, y: 0, edge: 'round', radius: '9px 9px 0 0', color: shade(c, 1.3), j: .5 });
    const b = put(node, { w, h, x: 0, y: 18, color: c, edge: 'round', radius: 10 });
    for (const x of [w * .22, w * .74]) box(b, { left: px(x), top: '0', width: '3px', height: '100%', background: 'rgba(255,255,255,.14)' });
    for (const x of [w * .12, w * .8]) box(b, { left: px(x), top: px(h * .4), width: px(w * .08), height: px(h * .16), background: '#C9CCD1', borderRadius: '2px' });
    if (sp.sticker) { const st = put(b, { w: 34, h: 24, x: w * .5, y: h * .62, color: '#F2EFE6', rot: -8, j: .5, bevel: false }); text(st, sp.sticker, { font: 'mono', size: 11, w: 34, h: 24, center: true }); }
    return { node, w, h: h + 22, anchor: 'b' };
  };
  B.pedestal = (sp, ctx) => {
    const w = sp.w || 200, h = sp.h || 170;
    const node = PM.div('', { position: 'relative', width: px(w), height: px(h) });
    put(node, { w, h: h - 18, x: 0, y: 18, color: sp.color || '#E7E2D6', j: 1 });
    put(node, { w: w + 16, h: 18, x: -8, y: 0, color: shade(sp.color || '#E7E2D6', 1.06), j: .8 });
    return { node, w, h, anchor: 'b' };
  };

  // ------------------------------------------------------------------ articulated paper puppet
  const POSES = {
    stand:   { sh: [8, 8], el: [6, 6], lean: 0, head: 0, hp: [3, 3], kn: [0, 0] },
    hands:   { sh: [14, 14], el: [28, 28], lean: 0, head: 0, hp: [3, 3], kn: [0, 0] },
    point:   { sh: [8, 78], el: [6, -8], lean: 2, head: -4, hp: [3, 3], kn: [0, 0] },
    watch:   { sh: [6, 24], el: [4, 108], lean: 3, head: 10, hp: [3, 3], kn: [0, 0] },
    phone:   { sh: [8, 22], el: [4, 100], lean: 2, head: 14, hp: [3, 3], kn: [0, 0] },
    mic:     { sh: [8, 20], el: [4, 120], lean: 0, head: 4, hp: [3, 3], kn: [0, 0] },
    cheer:   { sh: [150, 150], el: [-10, -10], lean: 0, head: -6, hp: [8, 8], kn: [0, 0] },
    wave:    { sh: [8, 135], el: [4, -20], lean: 0, head: 3, hp: [3, 3], kn: [0, 0] },
    sit:     { sh: [10, 10], el: [70, 70], lean: 2, head: 0, hp: [0, 0], kn: [0, 0], sit: 1 },
    sitTalk: { sh: [10, 36], el: [70, 40], lean: 3, head: 0, hp: [0, 0], kn: [0, 0], sit: 1 },
    sitWatch:{ sh: [8, 24], el: [60, 110], lean: 4, head: 12, hp: [0, 0], kn: [0, 0], sit: 1 },
    side:    { sh: [4, -4], el: [6, 6], lean: 0, head: 0, hp: [0, 0], kn: [0, 0] },
    sideWatch:{ sh: [4, 30], el: [6, 105], lean: 4, head: 10, hp: [0, 0], kn: [0, 0] },
  };
  const numAng = (a, b, t) => (Array.isArray(a) ? a.map((v, i) => lerp(v, b[i], t)) : lerp(a, b, t));
  function poseAt(spec, lt) {
    const get = (p) => (typeof p === 'string' ? POSES[p] || POSES.stand : Object.assign({}, POSES.stand, p));
    if (!Array.isArray(spec)) return Object.assign({}, get(spec || 'stand'));
    if (lt <= spec[0][0]) return Object.assign({}, get(spec[0][1]));
    for (let i = 1; i < spec.length; i++) {
      if (lt <= spec[i][0]) {
        const a = get(spec[i - 1][1]), b = get(spec[i][1]), t = (E[spec[i][2]] || E.inOutCubic)(clamp((lt - spec[i - 1][0]) / (spec[i][0] - spec[i - 1][0] || 1e-9)));
        const o = {}; for (const k of Object.keys(POSES.stand)) o[k] = numAng(a[k], b[k], t); o.sit = lerp(a.sit || 0, b.sit || 0, t); return o;
      }
    }
    return Object.assign({}, get(spec[spec.length - 1][1]));
  }
  B.puppet = (sp, ctx) => {
    const S = sp.size || 1, side = sp.view === 'side';
    const skin = sp.skin || '#D9C6B0', hair = sp.hair || '#2B2622', top = sp.top || '#43464D', bot = sp.bottom || '#23252A', shoe = sp.shoes || '#EDEAE0';
    const parts = sp.parts || {};
    const W = 300 * S, Ht = 380 * S, gx = W / 2, gy = Ht;
    const node = PM.div('', { position: 'relative', width: px(W), height: px(Ht) });
    const mk = (parent, x, y) => box(parent, { left: px(x * S), top: px(y * S), width: '0', height: '0' });
    const cutout = (parent, key, w, h, ox, oy, fallback) => { // an image part, or a placeholder paper piece
      if (parts[key]) {
        const im = document.createElement('img'); im.src = parts[key];
        Object.assign(im.style, { position: 'absolute', left: px(-w * ox * S), top: px(-h * oy * S), width: px(w * S), height: px(h * S), objectFit: 'contain',
          filter: 'drop-shadow(1.5px 0 0 #F5F2EA) drop-shadow(-1.5px 0 0 #F5F2EA) drop-shadow(0 1.5px 0 #F5F2EA) drop-shadow(0 -1.5px 0 #F5F2EA) drop-shadow(2px 5px 4px rgba(0,0,0,.35))' });
        parent.appendChild(im); return im;
      }
      return put(parent, Object.assign({ w: w * S, h: h * S, x: -w * ox * S, y: -h * oy * S, j: .8 }, fallback));
    };
    const root = mk(node, gx / S, gy / S), pelvis = mk(root, 0, -154);
    const legs = [-1, 1].map((sd) => {
      const hip = mk(pelvis, sd * (side ? 6 : 17), 0), thigh = cutout(hip, 'legU', 34, 74, .5, 0, { color: bot });
      const knee = mk(hip, 0, 72), shin = cutout(knee, 'legL', 28, 70, .5, 0, { color: shade(bot, 1.15) });
      const foot = cutout(knee, 'foot', 46, 16, side ? .3 : .5, -4.1, { color: shoe, edge: 'round', radius: 6 });
      return { hip, knee, thigh, shin, foot };
    });
    const torsoG = mk(pelvis, 0, 0);
    const tors = cutout(torsoG, 'torso', side ? 66 : 94, 122, .5, 1, { color: top, edge: 'poly', poly: side ? 'polygon(10% 0,90% 0,100% 100%,0 100%)' : 'polygon(8% 0,92% 0,100% 100%,0 100%)' });
    if (!parts.torso && sp.initial) { const b = box(torsoG, { left: px(-18 * S), top: px(-92 * S), width: px(36 * S), height: px(36 * S), borderRadius: '50%', background: '#F2EFE6', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '800 ' + (17 * S) + 'px var(--f-banner)', color: INK }); b.textContent = sp.initial; }
    const neckTop = mk(torsoG, 0, -122);
    const headG = mk(neckTop, 0, 0);
    if (!parts.torso) put(neckTop, { w: 22 * S, h: 20 * S, x: -11 * S, y: -14 * S, color: skin, shadow: false, bevel: false });
    const head = cutout(headG, 'head', side ? 62 : 70, 82, .5, .85, { color: skin, edge: 'poly', poly: 'polygon(14% 0,86% 0,100% 40%,86% 100%,14% 100%,0 40%)' });
    if (!parts.head) { put(headG, { w: (side ? 64 : 72) * S, h: 26 * S, x: -(side ? 32 : 36) * S, y: -70 * S, color: hair, edge: 'poly', poly: 'polygon(0 100%,8% 20%,50% 0,92% 20%,100% 100%,80% 60%,20% 60%)', shadow: false }); }
    const arms = [-1, 1].map((sd) => {
      const sho = mk(torsoG, side ? 0 : sd * 46, -112), upper = cutout(sho, 'armU', 24, 66, .5, 0, { color: top, j: .6 });
      const elb = mk(sho, 0, 64), fore = cutout(elb, 'armL', 20, 62, .5, 0, { color: skin, j: .6 });
      const hand = cutout(elb, 'hand', 22, 22, .5, -2.7, { color: skin, edge: 'circle' });
      return { sho, elb, upper, fore, hand };
    });
    const D = (a, o, origin) => { a.style.transformOrigin = origin || '0 0'; a.style.transform = 'rotate(' + o + 'deg)'; };
    const setRot = (g, deg) => { g.style.transform = 'rotate(' + deg.toFixed(2) + 'deg)'; };
    return {
      node, w: W, h: Ht, anchor: 'b',
      update(lt) {
        const t = Math.floor(lt * 12) / 12; // stop-motion: poses change at 12 fps, like moving paper by hand
        const p = poseAt(sp.pose, t);
        let hpL = p.hp[0], hpR = p.hp[1], knL = p.kn[0], knR = p.kn[1], shL = p.sh[0], shR = p.sh[1], elL = p.el[0], elR = p.el[1], bob = 0, lean = p.lean, headA = p.head;
        const walking = sp.walk === true || (Array.isArray(sp.walk) && sp.walk.some((r) => lt >= r[0] && lt <= r[1]));
        if (walking) {
          const ph = t * Math.PI * 2 * (sp.walkRate || 1.5);
          const s = Math.sin(ph), c = Math.cos(ph);
          hpL = 26 * s; hpR = -26 * s; knL = Math.max(0, -c) * 26 + 4; knR = Math.max(0, c) * 26 + 4;
          shL = -22 * s; shR = 22 * s; elL = 12; elR = 12; bob = Math.abs(Math.cos(ph)) * -4; lean = 3;
        }
        if (sp.talk && lt >= (sp.talkFrom || 0) && lt <= (sp.talkUntil || 1e9)) { headA += Math.sin(t * 7) * 3; shR += Math.sin(t * 5) * 10; elR += Math.sin(t * 6) * 12; bob += Math.sin(t * 5) * 1.2; }
        if (sp.lookAround) headA += Math.sin(t * 1.2) * 8;
        const sit = p.sit || 0;
        pelvis.style.transform = 'translate(0,' + px((bob + sit * 70) * S) + ')';
        legs.forEach((l, i) => { l.hip.style.display = sit > 0.5 ? 'none' : ''; });
        const L = side ? 1 : -1; // CSS sign: positive angle = clockwise
        if (side) {
          legs.forEach((l, i) => { setRot(l.hip, -(i ? hpR : hpL)); setRot(l.knee, (i ? knR : knL)); });
          arms.forEach((a, i) => { setRot(a.sho, -(i ? shR : shL)); setRot(a.elb, -(i ? elR : elL)); });
        } else {
          legs.forEach((l, i) => { const sd = i ? 1 : -1; setRot(l.hip, -sd * (i ? hpR : hpL)); setRot(l.knee, 0); });
          arms.forEach((a, i) => { const sd = i ? 1 : -1; setRot(a.sho, -sd * (i ? shR : shL)); setRot(a.elb, sd * (i ? elR : elL)); });
        }
        setRot(torsoG, lean); setRot(headG, headA);
        node.style.transform = sp.flip ? 'scaleX(-1)' : '';
      },
    };
  };
})();
