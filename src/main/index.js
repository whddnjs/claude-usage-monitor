const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { createTray, updateTrayTooltip } = require('./tray');
const { createTaskbarWidget, updateWidget, togglePopup } = require('./taskbar-widget');
const { startWatching, stopWatching } = require('./watcher');
const { parseClaudeData } = require('./parser');
const { loadHistory, recordUsage, getRecentDays } = require('./store');
const { checkThresholds } = require('./notifier');
const { fetchRateLimits } = require('./rate-limit');

const APP_ICON = path.join(__dirname, '..', '..', 'assets', 'claude-favicon.ico');

let mainWindow = null;
let splashWindow = null;
let tray = null;
let lastData = null;
let lastRateLimits = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.on('second-instance', () => {
  if (mainWindow && mainWindow.isVisible()) {
    mainWindow.focus();
  } else {
    toggleWindow();
  }
});

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 280,
    height: 180,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    icon: APP_ICON,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  splashWindow.loadFile(path.join(__dirname, '..', 'renderer', 'splash.html'));
  splashWindow.center();
  splashWindow.show();
}

function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 580,
    show: false,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    transparent: false,
    backgroundColor: '#1a1a2e',
    icon: APP_ICON,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.on('blur', () => {
    if (mainWindow && mainWindow.isVisible()) {
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function toggleWindow() {
  if (!mainWindow) {
    createWindow();
  }

  if (mainWindow.isVisible()) {
    mainWindow.hide();
    return;
  }

  const trayBounds = tray.getBounds();
  const windowBounds = mainWindow.getBounds();
  const x = Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2);
  const y = Math.round(trayBounds.y - windowBounds.height - 4);
  mainWindow.setPosition(x, y, false);
  mainWindow.show();
  mainWindow.focus();
}

async function refreshRateLimits() {
  try {
    lastRateLimits = await fetchRateLimits();
    console.log(`Rate limits: 5h=${(lastRateLimits.fiveHour.utilization * 100).toFixed(1)}% 7d=${(lastRateLimits.sevenDay.utilization * 100).toFixed(1)}%`);

    // Update widget
    updateWidget({ rateLimits: lastRateLimits });

    // Update tray tooltip
    const pct5h = (lastRateLimits.fiveHour.utilization * 100).toFixed(0);
    const pct7d = (lastRateLimits.sevenDay.utilization * 100).toFixed(0);
    const resetStr = formatResetTime(lastRateLimits.fiveHour.resetMs);
    updateTrayTooltip(`Claude Max 5x | 5h: ${pct5h}% | 7d: ${pct7d}% | 리셋: ${resetStr}`);

    // Send to renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('ratelimit-update', lastRateLimits);
    }
  } catch (err) {
    console.error('Rate limit fetch error:', err.message);
  }
}

async function refreshData() {
  try {
    const data = await parseClaudeData();
    if (!data) return;

    recordUsage(data.totals);
    lastData = data;

    checkThresholds(data.totals);

    // Send to renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      const history = getRecentDays(7);
      mainWindow.webContents.send('usage-update', { ...data, history });
    }
  } catch (err) {
    console.error('Error refreshing data:', err.message);
  }
}

function formatResetTime(ms) {
  if (!ms || ms <= 0) return '0m';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

app.whenReady().then(async () => {
  console.log('App ready');

  // Show splash screen immediately
  createSplash();

  loadHistory();
  tray = createTray(togglePopup);
  createTaskbarWidget();
  createWindow();

  // Initial load
  await Promise.all([refreshData(), refreshRateLimits()]);

  // Close splash after initial data is loaded
  closeSplash();

  // Watch for file changes → refresh data
  startWatching(() => {
    refreshData();
  });

  // Poll rate limits every 30s
  setInterval(refreshRateLimits, 30000);

  // Poll file data every 10s
  setInterval(refreshData, 10000);

  // IPC handlers
  ipcMain.handle('get-usage', async () => {
    if (!lastData) await refreshData();
    const history = getRecentDays(7);
    return lastData ? { ...lastData, history, rateLimits: lastRateLimits } : null;
  });

  ipcMain.handle('get-rate-limits', async () => {
    if (!lastRateLimits) await refreshRateLimits();
    return lastRateLimits;
  });

  ipcMain.on('popup-refresh', () => {
    refreshRateLimits();
  });
});

app.on('window-all-closed', (e) => {
  e.preventDefault();
});

app.on('before-quit', () => {
  stopWatching();
});
