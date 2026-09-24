const { contextBridge, ipcRenderer } = require('electron');
const invoke = method => value => ipcRenderer.invoke(`sayagain:${method}`, value);
contextBridge.exposeInMainWorld('sayagain', {
  state: invoke('state'), saveSettings: invoke('saveSettings'),
  addExpression: invoke('addExpression'), editExpression: invoke('editExpression'),
  saveVoice: invoke('saveVoice'), archiveVoice: invoke('archiveVoice'),
  defaultVoice: invoke('defaultVoice'), defaultSample: invoke('defaultSample'), addSample: invoke('addSample'),
  fullscreen: invoke('fullscreen'), backup: invoke('backup'),
  onFullscreen: callback => { const handler = (_event, value) => callback(value); ipcRenderer.on('sayagain:fullscreen-state', handler); return () => ipcRenderer.removeListener('sayagain:fullscreen-state', handler); },
});
