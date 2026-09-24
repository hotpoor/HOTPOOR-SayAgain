const { contextBridge, ipcRenderer } = require('electron');
const invoke = method => value => ipcRenderer.invoke(`sayagain:${method}`, value);
contextBridge.exposeInMainWorld('sayagain', {
  speakerPipeline:invoke('speakerPipeline'),analyzeRecording:invoke('analyzeRecording'),createRecording:invoke('createRecording'),addRecordingClip:invoke('addRecordingClip'),updateRecordingTranscript:invoke('updateRecordingTranscript'),recordingModels:invoke('recordingModels'),transcribeRecording:invoke('transcribeRecording'),state: invoke('state'), skillPackage:invoke('skillPackage'), setIntegration:invoke('setIntegration'), speechSettings:invoke('speechSettings'), clearApiKey:invoke('clearApiKey'), revealApiKey:invoke('revealApiKey'), listApiKeys:invoke('listApiKeys'), synthesize:invoke('synthesize'), cancelSynthesis:invoke('cancelSynthesis'), speechStatus:invoke('speechStatus'), cloudPlatform:invoke('cloudPlatform'),
  onChange:callback=>{const handler=()=>callback();ipcRenderer.on('sayagain:data-changed',handler);return()=>ipcRenderer.removeListener('sayagain:data-changed',handler);}, saveSettings: invoke('saveSettings'),
  addExpression: invoke('addExpression'), editExpression: invoke('editExpression'),
  saveVoice: invoke('saveVoice'), archiveVoice: invoke('archiveVoice'),
  defaultVoice: invoke('defaultVoice'), defaultSample: invoke('defaultSample'), addSample: invoke('addSample'),
  fullscreen: invoke('fullscreen'), backup: invoke('backup'),
  onFullscreen: callback => { const handler = (_event, value) => callback(value); ipcRenderer.on('sayagain:fullscreen-state', handler); return () => ipcRenderer.removeListener('sayagain:fullscreen-state', handler); },
});
