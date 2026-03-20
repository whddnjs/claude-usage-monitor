const fiveHourLabelEl = document.getElementById('fiveHourLabel');
const fiveHourResetEl = document.getElementById('fiveHourReset');
const weeklyLabelEl = document.getElementById('weeklyLabel');
const weeklyResetEl = document.getElementById('weeklyReset');
const ring5hCanvas = document.getElementById('ring5h');
const ring7dCanvas = document.getElementById('ring7d');
const widgetEl = document.getElementById('widget');

let fiveHourResetTarget = 0;
let weeklyResetTarget = 0;

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

function formatReset(ms) {
  if (ms <= 0) return '0:00';
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const s = Math.floor((ms % 60000) / 1000);
  if (h >= 24) {
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return `${d}d ${rh}h`;
  }
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function updateTimers() {
  const now = Date.now();
  if (fiveHourResetTarget) {
    fiveHourResetEl.textContent = formatReset(Math.max(0, fiveHourResetTarget - now));
  }
  if (weeklyResetTarget) {
    weeklyResetEl.textContent = formatReset(Math.max(0, weeklyResetTarget - now));
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

  fiveHourResetTarget = Date.now() + fiveHour.resetMs;
  weeklyResetTarget = Date.now() + sevenDay.resetMs;
});

// Initial empty rings
drawRing(ring5hCanvas, 0);
drawRing(ring7dCanvas, 0);

setInterval(updateTimers, 1000);
