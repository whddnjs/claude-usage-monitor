const { BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');

let widgetWindow = null;
let popupWindow = null;
let lastRateLimits = null;

function getTaskbarPosition() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: totalW, height: totalH } = primaryDisplay.size;
  const { width: workW, height: workH } = primaryDisplay.workAreaSize;
  const taskbarHeight = totalH - workH;

  const widgetW = 420;
  const widgetH = taskbarHeight > 0 ? taskbarHeight : 48;

  const x = totalW - widgetW - 100;
  const y = workH;

  console.log(`Screen: ${totalW}x${totalH}, WorkArea: ${workW}x${workH}, Taskbar: ${taskbarHeight}px, Widget at (${x}, ${y})`);

  return { x, y, widgetW, widgetH };
}

function createTaskbarWidget() {
  const { x, y, widgetW, widgetH } = getTaskbarPosition();

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

  // Position above widget
  const widgetBounds = widgetWindow.getBounds();
  const popupW = 320;
  const popupH = 380;
  const x = Math.round(widgetBounds.x + widgetBounds.width / 2 - popupW / 2);
  const y = widgetBounds.y - popupH - 8;

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
  const { x, y } = getTaskbarPosition();
  widgetWindow.setPosition(x, y);
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

function getWidgetWindow() {
  return widgetWindow;
}

module.exports = { createTaskbarWidget, updateWidget, getWidgetWindow, togglePopup };
