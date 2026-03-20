const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('widgetApi', {
  onUpdate: (callback) => {
    ipcRenderer.on('widget-update', (_event, data) => callback(data));
  },
  onLockState: (callback) => {
    ipcRenderer.on('widget-lock-state', (_event, locked) => callback(locked));
  },
  onShowWeekly: (callback) => {
    ipcRenderer.on('widget-show-weekly', (_event, show) => callback(show));
  },
  togglePopup: () => ipcRenderer.send('widget-toggle-popup'),
  dragStart: () => ipcRenderer.send('widget-drag-start'),
  dragTo: (x, y) => ipcRenderer.send('widget-drag-to', x, y),
  dragEnd: () => ipcRenderer.send('widget-drag-end'),
  contextMenu: () => ipcRenderer.send('widget-context-menu'),
  getLockState: () => ipcRenderer.send('widget-get-lock-state'),
});
