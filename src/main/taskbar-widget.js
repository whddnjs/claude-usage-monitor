const { BrowserWindow, screen, ipcMain, Menu } = require('electron');
const path = require('path');
const config = require('./config');

const APP_ICON = path.join(__dirname, '..', '..', 'assets', 'claude-favicon.ico');

const WIDGET_W = 100;
const WIDGET_H = 48;

let widgetWindow = null;
let popupWindow = null;
let lastRateLimits = null;
let savedPos = null; // cached for re-apply after show

function getDefaultPosition() {
  const display = screen.getPrimaryDisplay();
  const { width: totalW, height: totalH } = display.size;
  const workArea = display.workArea;
  const bounds = display.bounds;

  let taskbarPos = 'bottom';
  if (workArea.y > bounds.y) taskbarPos = 'top';
  else if (workArea.x > bounds.x) taskbarPos = 'left';
  else if (workArea.width < totalW) taskbarPos = 'right';

  let x, y;
  if (taskbarPos === 'bottom') {
    x = bounds.x + totalW - WIDGET_W - 140;
    y = workArea.y + workArea.height;
  } else if (taskbarPos === 'top') {
    x = bounds.x + totalW - WIDGET_W - 140;
    y = bounds.y;
  } else if (taskbarPos === 'right') {
    x = workArea.x + workArea.width;
    y = bounds.y + totalH - WIDGET_H - 100;
  } else {
    x = bounds.x;
    y = bounds.y + totalH - WIDGET_H - 100;
  }

  return { x, y };
}

function getSavedPosition() {
  const saved = config.get('widgetPosition', null);
  if (!saved) return null;

  // Validate position is on any connected display
  const displays = screen.getAllDisplays();
  const onScreen = displays.some(d => {
    const b = d.bounds;
    return saved.x >= b.x - 50 && saved.x < b.x + b.width + 50 &&
           saved.y >= b.y - 50 && saved.y < b.y + b.height + 50;
  });

  return onScreen ? saved : null;
}

function isLocked() {
  return config.get('widgetLocked', false);
}

function createTaskbarWidget() {
  savedPos = getSavedPosition();
  const pos = savedPos || getDefaultPosition();

  widgetWindow = new BrowserWindow({
    width: WIDGET_W,
    height: WIDGET_H,
    x: pos.x,
    y: pos.y,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload-widget.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  widgetWindow.setAlwaysOnTop(true, 'screen-saver');
  widgetWindow.loadFile(path.join(__dirname, '..', 'renderer', 'widget.html'));
  widgetWindow.setIgnoreMouseEvents(true, { forward: true });

  widgetWindow.webContents.on('did-finish-load', () => {
    widgetWindow.showInactive();
    // Re-apply exact position after show (Windows may shift it during setAlwaysOnTop)
    const target = savedPos || getDefaultPosition();
    widgetWindow.setPosition(target.x, target.y);
    // Send initial lock state to renderer
    widgetWindow.webContents.send('widget-lock-state', isLocked());
  });

  // Mouse interaction toggle
  ipcMain.on('widget-mouse-enter', () => {
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      widgetWindow.setIgnoreMouseEvents(false);
    }
  });

  ipcMain.on('widget-mouse-leave', () => {
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      widgetWindow.setIgnoreMouseEvents(true, { forward: true });
    }
  });

  // Click → popup
  ipcMain.on('widget-toggle-popup', () => {
    togglePopup();
  });

  // Drag support (only when unlocked)
  ipcMain.on('widget-drag-move', (_event, deltaX, deltaY) => {
    if (isLocked()) return;
    if (!widgetWindow || widgetWindow.isDestroyed()) return;
    const [cx, cy] = widgetWindow.getPosition();
    widgetWindow.setPosition(cx + deltaX, cy + deltaY);
  });

  ipcMain.on('widget-drag-end', () => {
    if (isLocked()) return;
    if (!widgetWindow || widgetWindow.isDestroyed()) return;
    const [x, y] = widgetWindow.getPosition();
    savedPos = { x, y };
    config.set('widgetPosition', savedPos);
    console.log(`Widget position saved: (${x}, ${y})`);
  });

  // Right-click context menu
  ipcMain.on('widget-context-menu', () => {
    showWidgetContextMenu();
  });

  // Query lock state
  ipcMain.on('widget-get-lock-state', () => {
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      widgetWindow.webContents.send('widget-lock-state', isLocked());
    }
  });

  screen.on('display-metrics-changed', () => {
    if (!config.get('widgetPosition', null)) {
      repositionWidget();
    }
  });

  setInterval(() => {
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      if (!widgetWindow.isVisible()) {
        widgetWindow.showInactive();
      }
      widgetWindow.setAlwaysOnTop(true, 'screen-saver');
    }
  }, 100);

  return widgetWindow;
}

function showWidgetContextMenu() {
  const locked = isLocked();

  const template = [
    {
      label: '위치 고정',
      type: 'checkbox',
      checked: locked,
      click: (menuItem) => {
        config.set('widgetLocked', menuItem.checked);
        if (widgetWindow && !widgetWindow.isDestroyed()) {
          widgetWindow.webContents.send('widget-lock-state', menuItem.checked);
        }
      },
    },
    { type: 'separator' },
    {
      label: '위치 초기화',
      click: () => {
        resetWidgetPosition();
      },
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  menu.popup({ window: widgetWindow });
}

function resetWidgetPosition() {
  savedPos = null;
  config.set('widgetPosition', null);
  repositionWidget();
}

function togglePopup() {
  if (popupWindow && !popupWindow.isDestroyed()) {
    if (popupWindow.isVisible()) {
      popupWindow.hide();
      return;
    }
  } else {
    createPopup();
  }

  const wb = widgetWindow.getBounds();
  const popupW = 320;
  const popupH = 380;

  const display = screen.getDisplayNearestPoint({ x: wb.x, y: wb.y });
  const da = display.workArea;

  let x = Math.round(wb.x + wb.width / 2 - popupW / 2);
  let y;

  const widgetCenterY = wb.y + wb.height / 2;
  const screenCenterY = display.bounds.y + display.size.height / 2;

  if (widgetCenterY > screenCenterY) {
    y = wb.y - popupH - 8;
  } else {
    y = wb.y + wb.height + 8;
  }

  x = Math.max(da.x, Math.min(x, da.x + da.width - popupW));
  y = Math.max(da.y, Math.min(y, da.y + da.height - popupH));

  popupWindow.setBounds({ x, y, width: popupW, height: popupH });

  const sendData = () => {
    if (lastRateLimits && popupWindow && !popupWindow.isDestroyed()) {
      popupWindow.webContents.send('popup-update', lastRateLimits);
    }
  };

  if (popupWindow.webContents.isLoading()) {
    popupWindow.webContents.once('did-finish-load', () => {
      popupWindow.show();
      popupWindow.focus();
      sendData();
    });
  } else {
    popupWindow.show();
    popupWindow.focus();
    sendData();
  }
}

function createPopup() {
  popupWindow = new BrowserWindow({
    width: 320,
    height: 280,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    icon: APP_ICON,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload-popup.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  popupWindow.loadFile(path.join(__dirname, '..', 'renderer', 'popup.html'));

  popupWindow.on('blur', () => {
    if (popupWindow && !popupWindow.isDestroyed() && popupWindow.isVisible()) {
      popupWindow.hide();
    }
  });
}

function repositionWidget() {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  const pos = getDefaultPosition();
  widgetWindow.setBounds({ x: pos.x, y: pos.y, width: WIDGET_W, height: WIDGET_H });
}

function updateWidget(data) {
  if (data.rateLimits) lastRateLimits = data.rateLimits;

  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.webContents.send('widget-update', data);
  }
  if (popupWindow && !popupWindow.isDestroyed() && popupWindow.isVisible()) {
    popupWindow.webContents.send('popup-update', data.rateLimits);
  }
}

module.exports = { createTaskbarWidget, updateWidget, togglePopup, resetWidgetPosition };
