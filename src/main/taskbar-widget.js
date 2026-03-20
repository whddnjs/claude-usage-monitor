const { BrowserWindow, screen, ipcMain, Menu } = require('electron');
const path = require('path');
const config = require('./config');

const APP_ICON = path.join(__dirname, '..', '..', 'assets', 'claude-favicon.ico');

const WIDGET_W_FULL = 100;
const WIDGET_W_SINGLE = 52;
const WIDGET_H = 48;

function getWidgetWidth() {
  return config.get('showWeekly', true) ? WIDGET_W_FULL : WIDGET_W_SINGLE;
}

let widgetWindow = null;
let popupWindow = null;
let lastRateLimits = null;
let isDragging = false;
let allowMove = false;

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
    x = bounds.x + totalW - getWidgetWidth() - 140;
    y = workArea.y + workArea.height;
  } else if (taskbarPos === 'top') {
    x = bounds.x + totalW - getWidgetWidth() - 140;
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

function isLocked() {
  return config.get('widgetLocked', false);
}

function createTaskbarWidget() {
  const saved = config.get('widgetPosition', null);
  const pos = saved || getDefaultPosition();

  console.log(`[Widget] Creating at (${pos.x}, ${pos.y}), saved=${JSON.stringify(saved)}`);

  widgetWindow = new BrowserWindow({
    width: getWidgetWidth(),
    height: WIDGET_H,
    x: pos.x,
    y: pos.y,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    thickFrame: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload-widget.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  widgetWindow.setAlwaysOnTop(true, 'screen-saver');
  widgetWindow.setMovable(false);
  widgetWindow.loadFile(path.join(__dirname, '..', 'renderer', 'widget.html'));

  // Prevent Windows DWM from moving the widget on its own (e.g. on click)
  widgetWindow.on('will-move', (event) => {
    if (!isDragging && !allowMove) {
      event.preventDefault();
    }
  });

  // Periodically re-assert always-on-top z-order
  // Position is protected by will-move + setMovable(false), so this is safe
  setInterval(() => {
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      widgetWindow.setAlwaysOnTop(true, 'screen-saver');
    }
  }, 100);

  widgetWindow.webContents.on('did-finish-load', () => {
    widgetWindow.setBounds({ x: pos.x, y: pos.y, width: getWidgetWidth(), height: WIDGET_H });
    widgetWindow.showInactive();

    const b = widgetWindow.getBounds();
    console.log(`[Widget] After show: target=(${pos.x},${pos.y}), actual=(${b.x},${b.y})`);

    widgetWindow.webContents.send('widget-lock-state', isLocked());
    widgetWindow.webContents.send('widget-show-weekly', config.get('showWeekly', true));
  });

  ipcMain.on('widget-toggle-popup', () => {
    togglePopup();
  });

  ipcMain.on('widget-drag-start', () => {
    isDragging = true;
  });

  ipcMain.on('widget-drag-to', (_event, x, y) => {
    if (isLocked()) return;
    if (!widgetWindow || widgetWindow.isDestroyed()) return;
    widgetWindow.setBounds({ x, y, width: getWidgetWidth(), height: WIDGET_H });
  });

  ipcMain.on('widget-drag-end', () => {
    isDragging = false;
    if (isLocked()) return;
    if (!widgetWindow || widgetWindow.isDestroyed()) return;
    const b = widgetWindow.getBounds();
    config.set('widgetPosition', { x: b.x, y: b.y });
    console.log(`[Widget] Position saved: (${b.x}, ${b.y})`);
  });

  ipcMain.on('widget-context-menu', () => {
    showWidgetContextMenu();
  });

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
  allowMove = true;
  widgetWindow.setBounds({ x: pos.x, y: pos.y, width: getWidgetWidth(), height: WIDGET_H });
  allowMove = false;
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

function setShowWeekly(show) {
  config.set('showWeekly', show);
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    const b = widgetWindow.getBounds();
    allowMove = true;
    widgetWindow.setBounds({ x: b.x, y: b.y, width: getWidgetWidth(), height: WIDGET_H });
    allowMove = false;
    widgetWindow.webContents.send('widget-show-weekly', show);
  }
}

module.exports = { createTaskbarWidget, updateWidget, togglePopup, resetWidgetPosition, setShowWeekly };
