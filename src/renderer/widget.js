const fiveHourLabelEl = document.getElementById('fiveHourLabel');
const weeklyLabelEl = document.getElementById('weeklyLabel');
const ring5hCanvas = document.getElementById('ring5h');
const ring7dCanvas = document.getElementById('ring7d');
const widgetEl = document.getElementById('widget');

function getColor(pct) {
  if (pct >= 80) return ['#dc2626', 'rgba(220,38,38,0.25)'];
  if (pct >= 50) return ['#eab308', 'rgba(234,179,8,0.25)'];
  return ['#059669', 'rgba(5,150,105,0.25)'];
}

function drawRing(canvas, pct) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const r = (Math.min(w, h) / 2) - 6;
  const lineW = 7;

  ctx.clearRect(0, 0, w, h);

  const [fg, bg] = getColor(pct);

  // Background ring
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = bg;
  ctx.lineWidth = lineW;
  ctx.stroke();

  // Foreground arc
  if (pct > 0) {
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + (Math.PI * 2 * Math.min(pct, 100) / 100);

    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, endAngle);
    ctx.strokeStyle = fg;
    ctx.lineWidth = lineW;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
}

widgetEl.addEventListener('mouseenter', () => window.widgetApi.mouseEnter());
widgetEl.addEventListener('mouseleave', () => window.widgetApi.mouseLeave());
widgetEl.addEventListener('click', () => window.widgetApi.togglePopup());

window.widgetApi.onUpdate((data) => {
  if (!data || !data.rateLimits) return;

  const { fiveHour, sevenDay } = data.rateLimits;

  const pct5h = Math.round(fiveHour.utilization * 100);
  const pct7d = Math.round(sevenDay.utilization * 100);

  fiveHourLabelEl.style.color = getColor(pct5h)[0];
  weeklyLabelEl.style.color = getColor(pct7d)[0];

  drawRing(ring5hCanvas, pct5h);
  drawRing(ring7dCanvas, pct7d);
});

// Initial empty rings
drawRing(ring5hCanvas, 0);
drawRing(ring7dCanvas, 0);
