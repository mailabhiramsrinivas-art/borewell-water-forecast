/* Borewell Forecast — shared behaviour: navigation + a small SVG chart kit. */
(function () {
  const toggle = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".site-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
  }
})();

const Kit = (() => {
  const NS = "http://www.w3.org/2000/svg";
  const el = (name, attrs = {}, text) => {
    const n = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) n.setAttribute(k, v);
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const fmt = (v, d = 1) => (v === null || v === undefined || !isFinite(v)) ? "—" : Number(v).toFixed(d);
  const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });
  const monthYearFmt = new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
  const day = s => Date.parse(`${s}T00:00:00Z`);

  function niceTicks(min, max, count = 5) {
    if (!(max > min)) { max = min + 1; }
    const span = max - min;
    const step0 = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => span / s <= count + 0.5) || 10 * mag;
    const out = [];
    for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(Math.round(v / step) * step);
    return out;
  }

  // one shared tooltip element
  let tip;
  function tooltip() {
    if (!tip) { tip = document.createElement("div"); tip.className = "chart-tip"; tip.setAttribute("role", "status"); document.body.appendChild(tip); }
    return tip;
  }
  function showTip(evt, title, rows) {
    const t = tooltip();
    t.replaceChildren();
    const h = document.createElement("div"); h.className = "t"; h.textContent = title; t.appendChild(h);
    for (const r of rows) {
      const row = document.createElement("div"); row.className = "r";
      const key = document.createElement("i"); key.style.setProperty("--c", r.color || "#fff"); row.appendChild(key);
      const b = document.createElement("b"); b.textContent = r.value; row.appendChild(b);
      const s = document.createElement("span"); s.textContent = r.name; row.appendChild(s);
      t.appendChild(row);
    }
    t.style.display = "block";
    const pad = 14, w = t.offsetWidth, hgt = t.offsetHeight;
    let x = evt.clientX + pad, y = evt.clientY + pad;
    if (x + w > window.innerWidth - 8) x = evt.clientX - w - pad;
    if (y + hgt > window.innerHeight - 8) y = evt.clientY - hgt - pad;
    t.style.left = `${x}px`; t.style.top = `${y}px`;
  }
  function hideTip() { if (tip) tip.style.display = "none"; }

  /** Line chart with optional bands, markers, vertical markers and a crosshair tooltip.
   * opts: {height, x:{min,max,ticks?,format,dates?}, y:{min?,max?,invert?,label,format,unit},
   *        series:[{name,color,points:[{x,y}],width?,dash?,markers?,band?:[{x,lo,hi}],endLabel?,tip?:false}],
   *        vlines:[{x,label}], tipTitle:(x)=>string, pad?} */
  function line(container, opts) {
    const W = Math.max(container.clientWidth, 300);
    const H = opts.height || Math.round(Math.min(420, Math.max(260, W * 0.42)));
    const m = Object.assign({ top: 18, right: opts.rightPad ?? 24, bottom: 36, left: 58 }, opts.margin || {});
    const iw = W - m.left - m.right, ih = H - m.top - m.bottom;
    const ys = [];
    for (const s of opts.series) {
      for (const p of s.points) if (p.y !== null && isFinite(p.y)) ys.push(p.y);
      for (const b of s.band || []) { if (isFinite(b.lo)) ys.push(b.lo); if (isFinite(b.hi)) ys.push(b.hi); }
    }
    let ymin = opts.y.min ?? Math.min(...ys), ymax = opts.y.max ?? Math.max(...ys);
    const padY = (ymax - ymin) * 0.08 || 1;
    if (opts.y.min === undefined) ymin -= padY;
    if (opts.y.max === undefined) ymax += padY;
    const yt = niceTicks(ymin, ymax, 5);
    if (yt.length > 1) {
      const st = yt[1] - yt[0];
      if (ymax > yt[yt.length - 1] + st * 0.02) yt.push(yt[yt.length - 1] + st);
      if (opts.y.min === undefined && ymin < yt[0] - st * 0.02) yt.unshift(yt[0] - st);
    }
    ymin = Math.min(ymin, yt[0]); ymax = Math.max(ymax, yt[yt.length - 1]);
    const X = v => m.left + (v - opts.x.min) / (opts.x.max - opts.x.min) * iw;
    const Y = v => opts.y.invert ? m.top + (v - ymin) / (ymax - ymin) * ih : m.top + ih - (v - ymin) / (ymax - ymin) * ih;
    const svg = el("svg", { class: "chart", width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opts.label || "chart" });
    for (const v of yt) {
      svg.appendChild(el("line", { class: "grid", x1: m.left, x2: W - m.right, y1: Y(v), y2: Y(v) }));
      svg.appendChild(el("text", { x: m.left - 8, y: Y(v) + 4, "text-anchor": "end" }, opts.y.format ? opts.y.format(v) : fmt(v, 0)));
    }
    const xt = opts.x.ticks || niceTicks(opts.x.min, opts.x.max, Math.max(3, Math.floor(iw / 110)));
    svg.appendChild(el("line", { class: "axis", x1: m.left, x2: W - m.right, y1: m.top + ih, y2: m.top + ih }));
    xt.forEach((v, i) => {
      if (v < opts.x.min - 1e-9 || v > opts.x.max + 1e-9) return;
      const anchor = i === 0 && X(v) - m.left < 30 ? "start" : (W - m.right - X(v) < 30 ? "end" : "middle");
      svg.appendChild(el("text", { x: X(v), y: H - 12, "text-anchor": anchor }, opts.x.format ? opts.x.format(v) : fmt(v, 0)));
    });
    for (const vl of opts.vlines || []) {
      svg.appendChild(el("line", { class: "today", x1: X(vl.x), x2: X(vl.x), y1: m.top, y2: m.top + ih }));
      if (vl.label) svg.appendChild(el("text", { x: X(vl.x) + 6, y: m.top + 12, class: "ylabel" }, vl.label));
    }
    for (const s of opts.series) {
      if (s.band && s.band.length) {
        const up = s.band.map((b, i) => `${i ? "L" : "M"}${X(b.x).toFixed(1)},${Y(b.lo).toFixed(1)}`).join("");
        const dn = [...s.band].reverse().map(b => `L${X(b.x).toFixed(1)},${Y(b.hi).toFixed(1)}`).join("");
        svg.appendChild(el("path", { d: `${up}${dn}Z`, fill: s.bandColor || "var(--wash-blue)", stroke: "none" }));
      }
    }
    for (const s of opts.series) {
      let d = "", pen = false;
      for (const p of s.points) {
        if (p.y === null || !isFinite(p.y)) { pen = false; continue; }
        d += `${pen ? "L" : "M"}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`;
        pen = true;
      }
      if (d && s.line !== false) svg.appendChild(el("path", { d, fill: "none", stroke: s.color, "stroke-width": s.width || 2, "stroke-linejoin": "round", "stroke-linecap": "round", "stroke-dasharray": s.dash || null }));
      if (s.markers) for (const p of s.points) if (p.y !== null && isFinite(p.y)) {
        svg.appendChild(el("circle", { cx: X(p.x), cy: Y(p.y), r: s.r || 4.5, fill: s.color, stroke: "var(--surface)", "stroke-width": 2 }));
      }
      if (s.endLabel) {
        const last = [...s.points].reverse().find(p => p.y !== null && isFinite(p.y));
        if (last) svg.appendChild(el("text", { class: "dlabel", x: X(last.x) + (s.labelDx ?? 8), y: Y(last.y) + (s.labelDy ?? 4), "text-anchor": s.labelAnchor || "start" }, s.endLabel));
      }
    }
    // crosshair tooltip
    const xs = [...new Set(opts.series.flatMap(s => s.tip === false ? [] : s.points.filter(p => p.y !== null && isFinite(p.y)).map(p => p.x)))].sort((a, b) => a - b);
    if (xs.length) {
      const cross = el("line", { class: "crosshair", y1: m.top, y2: m.top + ih, visibility: "hidden" });
      svg.appendChild(cross);
      const hit = el("rect", { x: m.left, y: m.top, width: iw, height: ih, fill: "transparent", tabindex: 0, "aria-label": "Move across the chart for values" });
      svg.appendChild(hit);
      const nearest = px => { let best = xs[0], bd = Infinity; for (const v of xs) { const dd = Math.abs(X(v) - px); if (dd < bd) { bd = dd; best = v; } } return best; };
      const move = evt => {
        const r = svg.getBoundingClientRect();
        const xv = nearest((evt.clientX - r.left) * (W / r.width));
        cross.setAttribute("x1", X(xv)); cross.setAttribute("x2", X(xv)); cross.setAttribute("visibility", "visible");
        const rows = [];
        for (const s of opts.series) {
          if (s.tip === false) continue;
          const p = s.points.find(q => q.x === xv && q.y !== null && isFinite(q.y));
          if (p) rows.push({ name: s.name, value: opts.y.format ? opts.y.format(p.y, true) : fmt(p.y), color: s.color });
          const b = (s.band || []).find(q => q.x === xv);
          if (b && s.bandName) rows.push({ name: s.bandName, value: `${fmt(b.lo)}–${fmt(b.hi)}${opts.y.unit || ""}`, color: "rgba(42,120,214,.35)" });
        }
        if (rows.length) showTip(evt, opts.tipTitle ? opts.tipTitle(xv) : String(xv), rows); else hideTip();
      };
      hit.addEventListener("pointermove", move);
      hit.addEventListener("pointerleave", () => { cross.setAttribute("visibility", "hidden"); hideTip(); });
    }
    container.replaceChildren(svg);
    return { X, Y };
  }

  /** Horizontal bars: items [{label, value, color, valueText?, sub?}] */
  function hbars(container, opts) {
    const W = Math.max(container.clientWidth, 300);
    const labelW = Math.min(opts.labelWidth || 240, W * 0.45);
    const row = 40, top = 6;
    const H = top + opts.items.length * row + 6;
    const max = opts.max ?? Math.max(...opts.items.map(i => i.value)) * 1.12;
    const iw = W - labelW - 70;
    const svg = el("svg", { class: "chart", width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opts.label || "bar chart" });
    opts.items.forEach((it, k) => {
      const y = top + k * row;
      svg.appendChild(el("text", { x: labelW - 12, y: y + 22, "text-anchor": "end", class: it.bold ? "dlabel" : null }, it.label));
      const w = Math.max(2, (it.value / max) * iw);
      const bar = el("path", { d: `M${labelW},${y + 8}h${w - 4}a4,4 0 0 1 4,4v12a4,4 0 0 1 -4,4h${-(w - 4)}z`, fill: it.color || "var(--s-blue)" });
      svg.appendChild(bar);
      svg.appendChild(el("text", { x: labelW + w + 8, y: y + 22, class: "dlabel" }, it.valueText ?? fmt(it.value, 2)));
    });
    container.replaceChildren(svg);
  }

  /** Vertical columns on a date/number axis: items [{x, value}] */
  function columns(container, opts) {
    const W = Math.max(container.clientWidth, 300);
    const H = opts.height || 150;
    const m = Object.assign({ top: 10, right: opts.rightPad ?? 24, bottom: 30, left: 58 }, opts.margin || {});
    const iw = W - m.left - m.right, ih = H - m.top - m.bottom;
    const max = opts.max ?? Math.max(...opts.items.map(i => i.value), 1);
    const yt = niceTicks(0, max, 3);
    const top = yt[yt.length - 1];
    const X = v => m.left + (v - opts.x.min) / (opts.x.max - opts.x.min) * iw;
    const Y = v => m.top + ih - v / top * ih;
    const svg = el("svg", { class: "chart", width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opts.label || "column chart" });
    for (const v of yt) {
      svg.appendChild(el("line", { class: "grid", x1: m.left, x2: W - m.right, y1: Y(v), y2: Y(v) }));
      svg.appendChild(el("text", { x: m.left - 8, y: Y(v) + 4, "text-anchor": "end" }, opts.yFormat ? opts.yFormat(v) : fmt(v, 0)));
    }
    const bw = Math.max(2, Math.min(opts.barWidth || 9, iw / opts.items.length - 2));
    for (const it of opts.items) {
      if (!(it.value > 0)) continue;
      const h = ih - (Y(it.value) - m.top);
      const x = X(it.x) - bw / 2, y = Y(it.value);
      const r = Math.min(3, bw / 2, h);
      const bar = el("path", { d: `M${x},${m.top + ih}V${y + r}a${r},${r} 0 0 1 ${r},${-r}h${bw - 2 * r}a${r},${r} 0 0 1 ${r},${r}V${m.top + ih}z`, fill: opts.color || "var(--s-blue)" });
      bar.addEventListener("pointermove", evt => showTip(evt, opts.tipTitle ? opts.tipTitle(it.x) : String(it.x), [{ name: opts.seriesName || "", value: opts.valueFormat ? opts.valueFormat(it.value) : fmt(it.value), color: opts.color || "var(--s-blue)" }]));
      bar.addEventListener("pointerleave", hideTip);
      svg.appendChild(bar);
    }
    svg.appendChild(el("line", { class: "axis", x1: m.left, x2: W - m.right, y1: m.top + ih, y2: m.top + ih }));
    const xt = opts.x.ticks || niceTicks(opts.x.min, opts.x.max, Math.max(3, Math.floor(iw / 110)));
    xt.forEach(v => { if (v >= opts.x.min && v <= opts.x.max) svg.appendChild(el("text", { x: X(v), y: H - 9, "text-anchor": "middle" }, opts.x.format ? opts.x.format(v) : fmt(v, 0))); });
    container.replaceChildren(svg);
  }

  /** Map of wells coloured by a sequential blue ramp. points [{x,y,v,id}], lines [[x1,y1,x2,y2]] */
  function wellMap(container, opts) {
    const W = Math.max(container.clientWidth, 300);
    const xs = opts.points.map(p => p.x), ys = opts.points.map(p => p.y);
    const minx = Math.min(...xs) - 1.5, maxx = Math.max(...xs) + 1.5, miny = Math.min(...ys) - 1.5, maxy = Math.max(...ys) + 1.5;
    const scale = W / (maxx - minx);
    const H = Math.round((maxy - miny) * scale);
    const X = v => (v - minx) * scale, Y = v => H - (v - miny) * scale;
    const svg = el("svg", { class: "chart", width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opts.label || "map of wells" });
    svg.appendChild(el("rect", { x: 0, y: 0, width: W, height: H, fill: "var(--surface)", rx: 10 }));
    const clip = `clip${Math.random().toString(36).slice(2)}`;
    const cp = el("clipPath", { id: clip }); cp.appendChild(el("rect", { x: 0, y: 0, width: W, height: H, rx: 10 })); svg.appendChild(cp);
    const g = el("g", { "clip-path": `url(#${clip})` }); svg.appendChild(g);
    for (const L of opts.lines || []) g.appendChild(el("line", { x1: X(L[0]), y1: Y(L[1]), x2: X(L[2]), y2: Y(L[3]), stroke: opts.lineColor || "#c9cfd3", "stroke-width": 1.2, "stroke-dasharray": opts.lineDash || null }));
    const vals = opts.points.map(p => p.v).sort((a, b) => a - b);
    const lo = vals[Math.floor(vals.length * 0.02)], hi = vals[Math.floor(vals.length * 0.98)];
    const ramp = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];
    const color = v => ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor((v - lo) / (hi - lo + 1e-12) * ramp.length)))];
    const r = Math.max(3.2, Math.min(5.5, W / 190));
    for (const p of opts.points) {
      const c = el("circle", { cx: X(p.x), cy: Y(p.y), r, fill: color(p.v), stroke: "var(--surface)", "stroke-width": 1.2 });
      g.appendChild(c);
      const hitc = el("circle", { cx: X(p.x), cy: Y(p.y), r: Math.max(r + 6, 9), fill: "transparent" });
      hitc.addEventListener("pointermove", evt => showTip(evt, p.id, opts.tipRows(p)));
      hitc.addEventListener("pointerleave", hideTip);
      g.appendChild(hitc);
    }
    container.replaceChildren(svg);
    return { ramp, lo, hi };
  }

  function onResize(fn) {
    let t; window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(fn, 120); });
  }

  function table(container, head, rows) {
    const t = document.createElement("table");
    const thead = t.createTHead().insertRow();
    head.forEach((h, i) => { const th = document.createElement("th"); th.textContent = h; if (i) th.className = "num"; thead.appendChild(th); });
    const tb = t.createTBody();
    for (const r of rows) {
      const tr = tb.insertRow();
      if (r.highlight) tr.className = "highlight";
      (r.cells || r).forEach((c, i) => { const td = tr.insertCell(); td.textContent = c; if (i) td.className = "num"; });
    }
    container.replaceChildren(t);
  }

  return { el, fmt, day, dateFmt, monthFmt, monthYearFmt, niceTicks, line, hbars, columns, wellMap, onResize, table, showTip, hideTip, css };
})();
