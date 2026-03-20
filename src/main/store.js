const fs = require('fs');
const path = require('path');
const { app } = require('electron');

let dataDir = null;
let historyFile = null;

function ensurePaths() {
  if (!dataDir) {
    dataDir = app.getPath('userData');
    historyFile = path.join(dataDir, 'usage-history.json');
  }
}

let history = {};
let lastTotals = null;

// Window tracking: 5-hour slots and weekly
let windows = {
  fiveHour: { slotKey: null, cost: 0, tokens: 0 },
  weekly: { slotKey: null, cost: 0, tokens: 0 },
};

function loadHistory() {
  ensurePaths();
  try {
    if (fs.existsSync(historyFile)) {
      const raw = fs.readFileSync(historyFile, 'utf-8');
      const data = JSON.parse(raw);
      history = data.daily || data;
      if (data.windows) windows = data.windows;
    }
  } catch {
    history = {};
  }
}

function saveHistory() {
  ensurePaths();
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(historyFile, JSON.stringify({ daily: history, windows }, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save history:', err.message);
  }
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

// 5-hour slot key: e.g. "2026-03-20-S2" (slot 2 = 10:00-15:00 UTC)
function getFiveHourSlotKey() {
  const now = new Date();
  const slot = Math.floor(now.getUTCHours() / 5);
  return `${now.toISOString().slice(0, 10)}-S${slot}`;
}

// Weekly key: ISO week starting Monday UTC
function getWeeklyKey() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay() || 7; // Mon=1 ... Sun=7
  d.setUTCDate(d.getUTCDate() - day + 1); // Monday
  return `W-${d.toISOString().slice(0, 10)}`;
}

function recordUsage(totals) {
  const today = getToday();
  const fiveHourKey = getFiveHourSlotKey();
  const weeklyKey = getWeeklyKey();

  // Daily tracking
  if (!history[today]) {
    history[today] = { cost: 0, inputTokens: 0, outputTokens: 0 };
    lastTotals = null;
  }

  // Reset windows if slot changed
  const fiveHourReset = windows.fiveHour.slotKey !== fiveHourKey;
  const weeklyReset = windows.weekly.slotKey !== weeklyKey;
  if (fiveHourReset) {
    windows.fiveHour = { slotKey: fiveHourKey, cost: 0, tokens: 0 };
  }
  if (weeklyReset) {
    windows.weekly = { slotKey: weeklyKey, cost: 0, tokens: 0 };
  }

  // First load or window reset: seed with current totals as baseline
  if (!lastTotals) {
    const totalTokens = totals.inputTokens + totals.outputTokens;
    if (fiveHourReset || windows.fiveHour.cost === 0) {
      windows.fiveHour.cost = totals.cost;
      windows.fiveHour.tokens = totalTokens;
    }
    if (weeklyReset || windows.weekly.cost === 0) {
      windows.weekly.cost = totals.cost;
      windows.weekly.tokens = totalTokens;
    }
    lastTotals = { ...totals };
    saveHistory();
    return;
  }

  const diffCost = totals.cost - lastTotals.cost;
  const diffTokens = (totals.inputTokens + totals.outputTokens) - (lastTotals.inputTokens + lastTotals.outputTokens);

  if (diffCost > 0) {
    history[today].cost += diffCost;
    windows.fiveHour.cost += diffCost;
    windows.weekly.cost += diffCost;
  }
  if (diffTokens > 0) {
    history[today].inputTokens += totals.inputTokens - lastTotals.inputTokens;
    history[today].outputTokens += totals.outputTokens - lastTotals.outputTokens;
    windows.fiveHour.tokens += diffTokens;
    windows.weekly.tokens += diffTokens;
  }

  lastTotals = { ...totals };

  // Prune to 30 days
  const keys = Object.keys(history).sort();
  while (keys.length > 30) {
    delete history[keys.shift()];
  }

  saveHistory();
}

function getRecentDays(n) {
  const result = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    result.push({
      date: key,
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      ...(history[key] || { cost: 0, inputTokens: 0, outputTokens: 0 }),
    });
  }
  return result;
}

module.exports = { loadHistory, recordUsage, getRecentDays };
