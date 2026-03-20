const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'usage-history.json');

let history = {};
let lastTotals = null;

// Window tracking: 5-hour slots and weekly
let windows = {
  fiveHour: { slotKey: null, cost: 0, tokens: 0 },
  weekly: { slotKey: null, cost: 0, tokens: 0 },
};

// Max limits for Max 5x (adjustable)
const LIMITS = {
  fiveHour: { cost: 6.0 },
  weekly: { cost: 45.0 },
};

function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const raw = fs.readFileSync(HISTORY_FILE, 'utf-8');
      const data = JSON.parse(raw);
      history = data.daily || data;
      if (data.windows) windows = data.windows;
    }
  } catch {
    history = {};
  }
}

function saveHistory() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(HISTORY_FILE, JSON.stringify({ daily: history, windows }, null, 2), 'utf-8');
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

// Time until next 5-hour slot reset (ms)
function getFiveHourResetMs() {
  const now = new Date();
  const currentSlot = Math.floor(now.getUTCHours() / 5);
  const nextSlotHour = (currentSlot + 1) * 5;
  const next = new Date(now);
  if (nextSlotHour >= 24) {
    next.setUTCDate(next.getUTCDate() + 1);
    next.setUTCHours(0, 0, 0, 0);
  } else {
    next.setUTCHours(nextSlotHour, 0, 0, 0);
  }
  return next.getTime() - now.getTime();
}

// Time until next weekly reset (Monday UTC 00:00)
function getWeeklyResetMs() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay() || 7;
  const daysUntilMonday = day === 1 ? 7 : (8 - day);
  const nextMonday = new Date(d);
  nextMonday.setUTCDate(nextMonday.getUTCDate() + daysUntilMonday);
  nextMonday.setUTCHours(0, 0, 0, 0);
  return nextMonday.getTime() - now.getTime();
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

  if (lastTotals) {
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
  } else {
    // First read - use current totals as baseline for daily
    history[today].cost = totals.cost;
    history[today].inputTokens = totals.inputTokens;
    history[today].outputTokens = totals.outputTokens;
  }

  lastTotals = { ...totals };

  // Prune to 30 days
  const keys = Object.keys(history).sort();
  while (keys.length > 30) {
    delete history[keys.shift()];
  }

  saveHistory();
}

function getWindowUsage() {
  return {
    fiveHour: {
      cost: windows.fiveHour.cost,
      tokens: windows.fiveHour.tokens,
      costPct: Math.min(100, (windows.fiveHour.cost / LIMITS.fiveHour.cost) * 100),
      resetMs: getFiveHourResetMs(),
      limit: LIMITS.fiveHour,
    },
    weekly: {
      cost: windows.weekly.cost,
      tokens: windows.weekly.tokens,
      costPct: Math.min(100, (windows.weekly.cost / LIMITS.weekly.cost) * 100),
      resetMs: getWeeklyResetMs(),
      limit: LIMITS.weekly,
    },
  };
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

module.exports = { loadHistory, recordUsage, getRecentDays, getWindowUsage };
