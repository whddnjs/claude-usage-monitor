let sResetTarget = 0;
let wResetTarget = 0;
let sResetTimestamp = 0;
let wResetTimestamp = 0;

function getPctClass(pct) {
  if (pct >= 80) return 'high';
  if (pct >= 50) return 'mid';
  return 'low';
}

function updateSection(prefix, pct, resetMs, resetTimestamp, status) {
  const cls = getPctClass(pct);
  const pctEl = document.getElementById(`${prefix}-pct`);
  const barEl = document.getElementById(`${prefix}-bar`);
  const statusEl = document.getElementById(`${prefix}-status`);
  const resetTimeEl = document.getElementById(`${prefix}-reset-time`);

  pctEl.textContent = `${pct}%`;
  pctEl.className = `section-pct pct-${cls}`;
  barEl.style.width = `${Math.min(100, pct)}%`;
  barEl.className = `progress-fill fill-${cls}`;

  // Status
  const statusMap = { allowed: 'OK', limited: '제한됨', unknown: '--' };
  statusEl.textContent = statusMap[status] || status;
  statusEl.style.color = status === 'allowed' ? '#059669' : '#dc2626';

  // Reset time
  if (resetTimestamp > 0) {
    const d = new Date(resetTimestamp * 1000);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    resetTimeEl.textContent = `${month}/${day} ${h}:${m}`;
  }
}

function formatCountdown(ms) {
  if (ms <= 0) return '00:00:00';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (h >= 24) {
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return `${d}일 ${rh}시간 ${String(m).padStart(2, '0')}분`;
  }
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function updateTimers() {
  const now = Date.now();
  document.getElementById('s-reset').textContent = formatCountdown(Math.max(0, sResetTarget - now));
  document.getElementById('w-reset').textContent = formatCountdown(Math.max(0, wResetTarget - now));
}

window.popupApi.onUpdate((data) => {
  if (!data) return;

  const { fiveHour, sevenDay } = data;

  const pct5h = Math.round(fiveHour.utilization * 100);
  const pct7d = Math.round(sevenDay.utilization * 100);

  sResetTarget = Date.now() + fiveHour.resetMs;
  wResetTarget = Date.now() + sevenDay.resetMs;
  sResetTimestamp = fiveHour.resetTimestamp;
  wResetTimestamp = sevenDay.resetTimestamp;

  updateSection('s', pct5h, fiveHour.resetMs, fiveHour.resetTimestamp, fiveHour.status);
  updateSection('w', pct7d, sevenDay.resetMs, sevenDay.resetTimestamp, sevenDay.status);
});

setInterval(updateTimers, 1000);

// Refresh button
const refreshBtn = document.getElementById('refreshBtn');
refreshBtn.addEventListener('click', () => {
  refreshBtn.classList.add('spinning');
  window.popupApi.refresh();
  setTimeout(() => refreshBtn.classList.remove('spinning'), 600);
});
