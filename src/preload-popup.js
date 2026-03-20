const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('popupApi', {
  onUpdate: (callback) => {
    ipcRenderer.on('popup-update', (_event, data) => callback(data));
  },
  refresh: () => ipcRenderer.send('popup-refresh'),
});
