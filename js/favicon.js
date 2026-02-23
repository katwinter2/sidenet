// ── Animated favicon ──
(function() {
  const SURFER_PATH = 'M80-40v-80h40q32 0 62-10t58-30q28 20 58 29.5t62 9.5q32 0 62.5-9.5T480-160q28 20 58 29.5t62 9.5q32 0 62.5-9.5T720-160q27 20 57.5 30t62.5 10h40v80h-40q-31 0-61-7.5T720-70q-29 15-59 22.5T600-40q-31 0-61-7.5T480-70q-29 15-59 22.5T360-40q-31 0-61-7.5T240-70q-29 15-59 22.5T120-40H80Zm260-760 222 41q14 2 27 11t22 25l35 62q26 45 72 73t102 28v80q-78 0-142-39T577-621l-90 61 153 120v154q16 11 31 23t29 23q-21 18-46 29t-54 11q-36 0-67-17t-53-43q-22 26-53 43t-67 17q-10 0-19.5-1.5T322-206q-86-59-144-119t-58-104q0-31 24-41t50-10q29 0 67 8.5t81 24.5l-21-124q-4-20 4.5-39.5T352-642l86-58q-3 0-14.5-2.5t-25.5-5-25.5-5Q361-715 358-715l-113 77-45-66 140-96Zm72 284 18 106q27 13 67 34.5t63 35.5v-60L412-516Zm268-224q-33 0-56.5-23.5T600-820q0-33 23.5-56.5T680-900q33 0 56.5 23.5T760-820q0 33-23.5 56.5T680-740Z';
  const PRIDE_COLORS = [
    '#000000', '#613915', '#5bcefa', '#f5a9b8', '#ffffff',
    '#e40303', '#ff8c00', '#ffed00', '#008026', '#004dff', '#750787'
  ];
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const faviconLink = document.querySelector('link[rel="icon"]');
  let phase = 0;
  let faviconInterval = null;

  function lerpColor(a, b, t) {
    const ah = parseInt(a.slice(1), 16), bh = parseInt(b.slice(1), 16);
    const ar = ah >> 16, ag = (ah >> 8) & 0xff, ab = ah & 0xff;
    const br = bh >> 16, bg = (bh >> 8) & 0xff, bb = bh & 0xff;
    const r = Math.round(ar + (br - ar) * t);
    const g = Math.round(ag + (bg - ag) * t);
    const b2 = Math.round(ab + (bb - ab) * t);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b2).toString(16).slice(1);
  }

  function getColorAt(t) {
    t = ((t % 1) + 1) % 1;
    const pos = t * (PRIDE_COLORS.length - 1);
    const i = Math.floor(pos);
    const frac = pos - i;
    return lerpColor(PRIDE_COLORS[Math.min(i, PRIDE_COLORS.length - 1)],
                     PRIDE_COLORS[Math.min(i + 1, PRIDE_COLORS.length - 1)], frac);
  }

  function renderFavicon() {
    ctx.clearRect(0, 0, 64, 64);
    const grad = ctx.createRadialGradient(20, 20, 4, 36, 36, 60);
    grad.addColorStop(0, getColorAt(phase));
    grad.addColorStop(0.5, getColorAt(phase + 0.15));
    grad.addColorStop(1, getColorAt(phase + 0.3));
    ctx.save();
    ctx.scale(64/960, 64/960);
    ctx.translate(0, 960);
    const p = new Path2D(SURFER_PATH);
    ctx.fillStyle = grad;
    ctx.fill(p);
    ctx.restore();
    faviconLink.href = canvas.toDataURL('image/png');
    phase = (phase + 0.02) % 1;
  }

  function startFaviconCycle() {
    if (!faviconInterval) {
      faviconInterval = setInterval(renderFavicon, 200);
      renderFavicon();
    }
  }

  function stopFaviconCycle() {
    if (faviconInterval) {
      clearInterval(faviconInterval);
      faviconInterval = null;
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopFaviconCycle();
    else startFaviconCycle();
  });

  if (!document.hidden) startFaviconCycle();
})();
