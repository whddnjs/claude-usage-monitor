const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('path');

const config = require('./config');

let tray = null;
let resetWidgetFn = null;
let setShowWeeklyFn = null;

function createTrayIcon() {
  const iconPath = path.join(__dirname, '..', '..', 'assets', 'claude-favicon.ico');
  return nativeImage.createFromPath(iconPath);
}

function createTray(onToggle, onResetWidget, onSetShowWeekly) {
  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('Claude Usage Monitor - 로딩중...');
  resetWidgetFn = onResetWidget;
  setShowWeeklyFn = onSetShowWeekly;

  rebuildContextMenu();

  tray.on('click', () => {
    onToggle();
  });

  return tray;
}

function rebuildContextMenu() {
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '주간 사용량 보기',
      type: 'checkbox',
      checked: config.get('showWeekly', true),
      click: (menuItem) => {
        if (setShowWeeklyFn) setShowWeeklyFn(menuItem.checked);
      },
    },
    {
      label: '위젯 위치 초기화',
      click: () => {
        if (resetWidgetFn) resetWidgetFn();
      },
    },
    { type: 'separator' },
    {
      label: '시작 시 실행',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (menuItem) => {
        app.setLoginItemSettings({
          openAtLogin: menuItem.checked,
          name: 'Claude Usage Monitor',
        });
      },
    },
    { type: 'separator' },
    { label: '종료', click: () => { app.quit(); } },
  ]);

  tray.setContextMenu(contextMenu);
}

function updateTrayTooltip(text) {
  if (tray && !tray.isDestroyed()) {
    tray.setToolTip(text);
  }
}

module.exports = { createTray, updateTrayTooltip };
