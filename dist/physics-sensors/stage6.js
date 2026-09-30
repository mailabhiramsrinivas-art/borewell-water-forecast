/* Stage 2 · Physics + sensors — small helpers shared by the section's pages (uses Kit from assets/site.js). */
const Stage6 = (() => {
  const cache = {};
  const load = name => cache[name] || (cache[name] = fetch(`${Stage6Base}data/${name}.json`).then(r => {
    if (!r.ok) throw new Error(`${name}.json: ${r.status}`);
    return r.json();
  }));
  const f2 = v => Kit.fmt(v, 2), f1 = v => Kit.fmt(v, 1);
  const H = [...Array(13).keys()];
  const hLabel = h => h === 0 ? "Now" : `${h} wk`;
  const t = s => Kit.day(s);

  /** Month ticks every `step` months between two timestamps. */
  function monthTicks(min, max, step) {
    const out = []; const d = new Date(min); d.setUTCDate(1); d.setUTCHours(0, 0, 0, 0);
    if (d.getTime() < min) d.setUTCMonth(d.getUTCMonth() + 1);
    while (d.getTime() <= max) { if (d.getUTCMonth() % step === 0) out.push(d.getTime()); d.setUTCMonth(d.getUTCMonth() + 1); }
    return out;
  }

  /** A segmented control: buttons [{value,label}], calls onChange(value). */
  function seg(container, buttons, initial, onChange) {
    container.replaceChildren();
    let cur = initial;
    for (const b of buttons) {
      const el = document.createElement("button"); el.type = "button"; el.textContent = b.label;
      el.setAttribute("aria-pressed", String(b.value === cur));
      el.addEventListener("click", () => {
        cur = b.value;
        container.querySelectorAll("button").forEach((x, k) => x.setAttribute("aria-pressed", String(buttons[k].value === cur)));
        onChange(cur);
      });
      container.appendChild(el);
    }
    return () => cur;
  }

  function fail(el, err) {
    el.innerHTML = `<p class="note">The chart data could not be loaded (${err.message}). Serve the site over http(s) rather than opening the file directly.</p>`;
  }

  return { load, f1, f2, H, hLabel, t, monthTicks, seg, fail };
})();
