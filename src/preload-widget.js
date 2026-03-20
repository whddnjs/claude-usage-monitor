const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('widgetApi', {
  onUpdate: (callback) => {
    ipcRenderer.on('widget-update', (_event, data) => callback(data));
  },
  mouseEnter: () => ipcRenderer.send('widget-mouse-enter'),
  mouseLeave: () => ipcRenderer.send('widget-mouse-leave'),
  togglePopup: () => ipcRenderer.send('widget-toggle-popup'),
});
