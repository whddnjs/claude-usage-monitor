const { BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');

const APP_ICON = path.join(__dirname, '..', '..', 'assets', 'claude-favicon.ico');

let widgetWindow = null;
let popupWindow = null;
let lastRateLimits = null;

function getTaskbarInfo() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: totalW, height: totalH } = primaryDisplay.size;
  const workArea = primaryDisplay.workArea;
  const scaleFactor = primaryDisplay.scaleFactor || 1;

  // Detect taskbar position by comparing workArea to total size
  let taskbarPos = 'bottom';
  let taskbarSize = 0;

  if (workArea.y > 0) {
    taskbarPos = 'top';
    taskbarSize = workArea.y;
  } else if (workArea.x > 0) {
    taskbarPos = 'left';
    taskbarSize = workArea.x;
  } else if (workArea.width < totalW) {
    taskbarPos = 'right';
    taskbarSize = totalW - workArea.width;
  } else {
    taskbarPos = 'bottom';
    taskbarSize = totalH - workArea.height;
  }

  // Fallback taskbar size
  if (taskbarSize <= 0) taskbarSize = Math.round(48 / scaleFactor);

  console.log(`Screen: ${totalW}x${totalH}, WorkArea: ${workArea.x},${workArea.y} ${workArea.width}x${workArea.height}, Taskbar: ${taskbarPos} ${taskbarSize}px, Scale: ${scaleFactor}`);

  return { totalW, totalH, workArea, taskbarPos, taskbarSize, scaleFactor };
}

function getWidgetBounds() {
  const { totalW, totalH, workArea, taskbarPos, taskbarSize } = getTaskbarInfo();

  // Widget content is 2 rings (32px each) + separator + gaps ≈ 90px
  const widgetW = 100;
  const widgetH = taskbarSize;

  let x, y;

  if (taskbarPos === 'bottom') {
    x = totalW - widgetW - 140;
    y = workArea.height + workArea.y;
  } else if (taskbarPos === 'top') {
    x = totalW - widgetW - 140;
    y = 0;
  } else if (taskbarPos === 'right') {
    x = workArea.width + workArea.x;
    y = totalH - widgetH - 100;
  } else {
    // left
    x = 0;
    y = totalH - widgetH - 100;
  }

  return { x, y, widgetW, widgetH, taskbarPos };
}

function createTaskbarWidget() {
  const { x, y, widgetW, widgetH } = getWidgetBounds();

  widgetWindow = new BrowserWindow({
    width: widgetW,
    height: widgetH,
    x,
    y,
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
    console.log('Widget loaded, showing...');
    widgetWindow.showInactive();
  });

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

  ipcMain.on('widget-toggle-popup', () => {
    togglePopup();
  });

  screen.on('display-metrics-changed', () => {
    repositionWidget();
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

function togglePopup() {
  if (popupWindow && !popupWindow.isDestroyed()) {
    if (popupWindow.isVisible()) {
      popupWindow.hide();
      return;
    }
  } else {
    createPopup();
  }

  // Position popup relative to widget, based on taskbar position
  const widgetBounds = widgetWindow.getBounds();
  const { taskbarPos } = getWidgetBounds();
  const popupW = 320;
  const popupH = 380;

  let x, y;

  if (taskbarPos === 'bottom') {
    x = Math.round(widgetBounds.x + widgetBounds.width / 2 - popupW / 2);
    y = widgetBounds.y - popupH - 8;
  } else if (taskbarPos === 'top') {
    x = Math.round(widgetBounds.x + widgetBounds.width / 2 - popupW / 2);
    y = widgetBounds.y + widgetBounds.height + 8;
  } else if (taskbarPos === 'right') {
    x = widgetBounds.x - popupW - 8;
    y = Math.round(widgetBounds.y + widgetBounds.height / 2 - popupH / 2);
  } else {
    x = widgetBounds.x + widgetBounds.width + 8;
    y = Math.round(widgetBounds.y + widgetBounds.height / 2 - popupH / 2);
  }

  // Clamp to screen bounds
  const { totalW, totalH } = getTaskbarInfo();
  x = Math.max(0, Math.min(x, totalW - popupW));
  y = Math.max(0, Math.min(y, totalH - popupH));

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
  const { x, y, widgetW, widgetH } = getWidgetBounds();
  widgetWindow.setBounds({ x, y, width: widgetW, height: widgetH });
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

module.exports = { createTaskbarWidget, updateWidget, togglePopup };
