const fiveHourLabelEl = document.getElementById('fiveHourLabel');
const weeklyLabelEl = document.getElementById('weeklyLabel');
const ring5hCanvas = document.getElementById('ring5h');
const ring7dCanvas = document.getElementById('ring7d');
const widgetEl = document.getElementById('widget');
const weeklyBlock = document.getElementById('weeklyBlock');
const sepEl = document.getElementById('sep');

let locked = false;

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

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = bg;
  ctx.lineWidth = lineW;
  ctx.stroke();

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

function updateCursor() {
  widgetEl.style.cursor = locked ? 'default' : 'grab';
}

// --- Lock state ---
window.widgetApi.onLockState((state) => {
  locked = state;
  updateCursor();
});
window.widgetApi.getLockState();

// --- Show weekly toggle ---
window.widgetApi.onShowWeekly((show) => {
  weeklyBlock.style.display = show ? 'flex' : 'none';
  sepEl.style.display = show ? 'block' : 'none';
});

// --- Drag & Click ---
const DRAG_THRESHOLD = 5;
let drag = null;

widgetEl.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  // Record the mouse-down screen position AND the offset within the widget
  drag = {
    mouseStartX: e.screenX,
    mouseStartY: e.screenY,
    // offset from widget top-left to mouse position
    offsetX: e.clientX,
    offsetY: e.clientY,
    moving: false,
  };
});

document.addEventListener('mousemove', (e) => {
  if (!drag || locked) return;

  if (!drag.moving) {
    const dx = Math.abs(e.screenX - drag.mouseStartX);
    const dy = Math.abs(e.screenY - drag.mouseStartY);
    if (dx < DRAG_THRESHOLD && dy < DRAG_THRESHOLD) return;
    drag.moving = true;
    widgetEl.style.cursor = 'grabbing';
    window.widgetApi.dragStart();
  }

  // Set window position so the mouse stays at the same offset within the widget
  const newX = e.screenX - drag.offsetX;
  const newY = e.screenY - drag.offsetY;
  window.widgetApi.dragTo(newX, newY);
});

document.addEventListener('mouseup', (e) => {
  if (!drag) return;

  if (drag.moving) {
    window.widgetApi.dragEnd();
    updateCursor();
  } else if (e.button === 0) {
    window.widgetApi.togglePopup();
  }

  drag = null;
});

// Right-click
widgetEl.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  window.widgetApi.contextMenu();
});

// --- Data updates ---
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

drawRing(ring5hCanvas, 0);
drawRing(ring7dCanvas, 0);
