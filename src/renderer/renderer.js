// DOM elements
const el = {
  accountName: document.getElementById('accountName'),
  subBadge: document.getElementById('subBadge'),
  resetTimer: document.getElementById('resetTimer'),
  totalCost: document.getElementById('totalCost'),
  totalTokens: document.getElementById('totalTokens'),
  projectCount: document.getElementById('projectCount'),
  dailyChart: document.getElementById('dailyChart'),
  projectTable: document.getElementById('projectTable'),
  modelTable: document.getElementById('modelTable'),
};

let resetTargetMs = 0;

function formatTokens(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function updateUI(data) {
  if (!data) return;

  // Header
  el.accountName.textContent = data.account.displayName;
  const tierMatch = (data.account.rateLimitTier || '').match(/(\d+x)/);
  const tierLabel = tierMatch ? `Max ${tierMatch[1]}` : 'Max';
  el.subBadge.textContent = tierLabel;

  // Reset timer
  if (data.resetTimer) {
    resetTargetMs = Date.now() + data.resetTimer;
  }

  // Summary cards
  el.totalCost.textContent = `$${data.totals.cost.toFixed(2)}`;
  el.totalTokens.textContent = formatTokens(data.totals.inputTokens + data.totals.outputTokens);
  el.projectCount.textContent = data.projectCount;

  // Daily chart
  if (data.history) {
    drawChart(data.history);
  }

  // Project table
  renderProjectTable(data.projects);

  // Model table
  renderModelTable(data.modelUsage);
}

function renderProjectTable(projects) {
  if (!projects || projects.length === 0) {
    el.projectTable.innerHTML = '<tr><td colspan="4" class="empty">데이터 없음</td></tr>';
    return;
  }

  el.projectTable.innerHTML = projects.map(p => `
    <tr>
      <td class="project-name" title="${p.path}">${p.shortName}</td>
      <td class="cost">$${p.cost.toFixed(2)}</td>
      <td>${formatTokens(p.inputTokens)}/${formatTokens(p.outputTokens)}</td>
      <td class="cache">${p.cacheHitRate.toFixed(0)}%</td>
    </tr>
  `).join('');
}

function renderModelTable(modelUsage) {
  if (!modelUsage || Object.keys(modelUsage).length === 0) {
    el.modelTable.innerHTML = '<tr><td colspan="3" class="empty">데이터 없음</td></tr>';
    return;
  }

  const entries = Object.entries(modelUsage).sort((a, b) => b[1].costUSD - a[1].costUSD);
  el.modelTable.innerHTML = entries.map(([model, usage]) => {
    const shortModel = model.replace('claude-', '');
    const totalTokens = (usage.inputTokens || 0) + (usage.outputTokens || 0) +
                        (usage.cacheReadInputTokens || 0) + (usage.cacheCreationInputTokens || 0);
    return `
      <tr>
        <td class="project-name">${shortModel}</td>
        <td class="cost">$${usage.costUSD.toFixed(2)}</td>
        <td>${formatTokens(totalTokens)}</td>
      </tr>
    `;
  }).join('');
}

function drawChart(history) {
  const canvas = el.dailyChart;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  canvas.width = canvas.offsetWidth * dpr;
  canvas.height = canvas.offsetHeight * dpr;
  ctx.scale(dpr, dpr);

  const W = canvas.offsetWidth;
  const H = canvas.offsetHeight;

  ctx.clearRect(0, 0, W, H);

  const padding = { top: 15, right: 10, bottom: 25, left: 40 };
  const chartW = W - padding.left - padding.right;
  const chartH = H - padding.top - padding.bottom;

  const costs = history.map(d => d.cost);
  const maxCost = Math.max(...costs, 0.01);

  const barWidth = chartW / history.length * 0.6;
  const gap = chartW / history.length;

  // Grid lines
  ctx.strokeStyle = '#2a2a4a';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(W - padding.right, y);
    ctx.stroke();
  }

  // Y-axis labels
  ctx.fillStyle = '#666';
  ctx.font = '10px Segoe UI';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const val = maxCost * (1 - i / 4);
    const y = padding.top + (chartH / 4) * i;
    ctx.fillText(`$${val.toFixed(1)}`, padding.left - 5, y + 3);
  }

  // Bars
  history.forEach((d, i) => {
    const x = padding.left + gap * i + (gap - barWidth) / 2;
    const barH = (d.cost / maxCost) * chartH;
    const y = padding.top + chartH - barH;

    // Gradient bar
    const grad = ctx.createLinearGradient(x, y, x, y + barH);
    grad.addColorStop(0, '#7c3aed');
    grad.addColorStop(1, '#4c1d95');
    ctx.fillStyle = grad;

    // Rounded top
    const r = Math.min(3, barWidth / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + barWidth - r, y);
    ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + r);
    ctx.lineTo(x + barWidth, y + barH);
    ctx.lineTo(x, y + barH);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.fill();

    // X-axis label
    ctx.fillStyle = '#666';
    ctx.font = '10px Segoe UI';
    ctx.textAlign = 'center';
    ctx.fillText(d.label, x + barWidth / 2, H - 5);
  });
}

// Reset timer countdown
function updateResetTimer() {
  if (!resetTargetMs) return;
  const remaining = Math.max(0, resetTargetMs - Date.now());
  const h = Math.floor(remaining / 3600000);
  const m = Math.floor((remaining % 3600000) / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  el.resetTimer.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

setInterval(updateResetTimer, 1000);

// Initial load
window.api.getUsage().then(updateUI);

// Live updates from main process
window.api.onUsageUpdate(updateUI);

// Periodically sync reset timer
setInterval(async () => {
  const ms = await window.api.getResetTimer();
  resetTargetMs = Date.now() + ms;
}, 60000);
