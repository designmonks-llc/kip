// The share picker's only bridge to the app: list what can be shared, and send back the choice.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('picker', {
  list: () => ipcRenderer.invoke('picker:list'),
  choose: (id) => ipcRenderer.send('picker:choose', id),
});
