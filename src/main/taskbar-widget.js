const { BrowserWindow, screen, ipcMain, Menu } = require('electron');
const path = require('path');
const config = require('./config');

const APP_ICON = path.join(__dirname, '..', '..', 'assets', 'claude-favicon.ico');

const WIDGET_W = 100;
const WIDGET_H = 48;

let widgetWindow = null;
let popupWindow = null;
let lastRateLimits = null;

function getTaskbarRect() {
  const display = screen.getPrimaryDisplay();
  const { width: totalW, height: totalH } = display.size;
  const workArea = display.workArea;
  const bounds = display.bounds;

  // Taskbar is the area between full screen and work area
  let rect;
  if (workArea.y > bounds.y) {
    // top
    rect = { x: bounds.x, y: bounds.y, width: totalW, height: workArea.y - bounds.y };
  } else if (workArea.x > bounds.x) {
    // left
    rect = { x: bounds.x, y: bounds.y, width: workArea.x - bounds.x, height: totalH };
  } else if (workArea.width < totalW) {
    // right
    rect = { x: workArea.x + workArea.width, y: bounds.y, width: totalW - workArea.width, height: totalH };
  } else {
    // bottom (default)
    rect = { x: bounds.x, y: workArea.y + workArea.height, width: totalW, height: totalH - workArea.height };
  }

  // Fallback if taskbar size is 0
  if (rect.height <= 0) rect.height = 48;
  if (rect.width <= 0) rect.width = 48;

  return rect;
}

function getDefaultPosition() {
  const tb = getTaskbarRect();
  const x = tb.x + tb.width - WIDGET_W - 140;
  const y = tb.y;
  return { x, y };
}

function isOnTaskbar(x, y) {
  const tb = getTaskbarRect();
  // Allow some tolerance (widget partially outside is OK)
  const margin = 20;
  return x >= tb.x - margin && x + WIDGET_W <= tb.x + tb.width + margin &&
         y >= tb.y - margin && y + WIDGET_H <= tb.y + tb.height + margin;
}

function getSavedPosition() {
  const saved = config.get('widgetPosition', null);
  if (!saved) return null;

  // Validate position is still on taskbar
  if (!isOnTaskbar(saved.x, saved.y)) return null;

  return saved;
}

function isLocked() {
  return config.get('widgetLocked', false);
}

function createTaskbarWidget() {
  const saved = getSavedPosition();
  const pos = saved || getDefaultPosition();

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

    // If dropped outside taskbar, reset to default
    if (!isOnTaskbar(x, y)) {
      console.log('Widget dropped outside taskbar, resetting position');
      resetWidgetPosition();
      return;
    }

    config.set('widgetPosition', { x, y });
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
