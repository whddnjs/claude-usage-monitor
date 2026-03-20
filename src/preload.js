const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getUsage: () => ipcRenderer.invoke('get-usage'),
  getResetTimer: () => ipcRenderer.invoke('get-reset-timer'),
  onUsageUpdate: (callback) => {
    ipcRenderer.on('usage-update', (_event, data) => callback(data));
  },
});
