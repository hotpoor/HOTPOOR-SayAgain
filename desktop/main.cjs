const { app, BrowserWindow, ipcMain, protocol, dialog, session, Menu, net, shell, clipboard, nativeImage } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const {createReadStream}=require('node:fs');
const {Readable}=require('node:stream');
const { pathToFileURL } = require('node:url');
const { Service } = require('./service.cjs');
const { startBridge } = require('./bridge.cjs');
const { Speech } = require('./speech.cjs');
const { createSecrets } = require('./secrets.cjs');
app.setName('HOTPOOR SayAgain');
if (process.env.SAYAGAIN_DATA_DIR) {
  if (!path.isAbsolute(process.env.SAYAGAIN_DATA_DIR)) throw new Error('SAYAGAIN_DATA_DIR must be absolute');
  app.setPath('userData', process.env.SAYAGAIN_DATA_DIR);
}
protocol.registerSchemesAsPrivileged([{ scheme: 'sayagain-asset', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
let win, service, bridge, speech, speakerPipeline, quitting=false;
const pagePath = path.join(__dirname, '../renderer/index.html');
const iconPath = path.join(__dirname, '../renderer/assets/sayagain-icon.png');
const pageUrl = pathToFileURL(pagePath).href;
const trusted = event => event.sender === win?.webContents && event.senderFrame === win.webContents.mainFrame && event.senderFrame.url === pageUrl;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win?.isMinimized()) win.restore(); win?.focus(); });
  app.whenReady().then(async () => {
    const brandIcon=nativeImage.createFromPath(iconPath);
    if(!brandIcon.isEmpty()&&process.platform==='darwin')app.dock.setIcon(brandIcon);
    app.setAboutPanelOptions({applicationName:'SayAgain',applicationVersion:app.getVersion(),credits:'Created by HOTPOOR XIALIWEI',iconPath});
    const screenshots = require('./screenshot/index.cjs').createScreenCapture({directory: app.getPath('userData'), title: 'HOTPOOR SayAgain', defaultPriority: 50});
    ipcMain.handle('sayagain:screenshotSettings', event => { if (!trusted(event)) throw Error('无效的页面来源'); return screenshots.openSettings(); });
    service = new Service(path.join(app.getPath('userData'), 'data'));
    const changed=()=>{if(win&&!win.isDestroyed())win.webContents.send('sayagain:data-changed');};
    bridge=await startBridge(service,app.getPath('userData'),changed);
    speakerPipeline=new (require('./speaker-pipeline.cjs').SpeakerPipeline)(service,app.getPath('userData'),changed);
    speech=new Speech(service,app.getPath('userData'),{secrets:createSecrets(app.getPath('userData')),fetch:(url,options)=>net.fetch(url,options),onChange:changed});
    const methods = ['saveRecordingPerson','linkRecordingPerson','updateRecordingSpeaker','confirmRecordingTurns','clearRecordingAnalysis','createRecording','addRecordingClip','updateRecordingTranscript','setIntegration', 'state', 'saveSettings', 'addExpression', 'editExpression', 'saveVoice', 'archiveVoice', 'defaultVoice', 'defaultSample', 'addSample'];
    for (const method of methods) ipcMain.handle(`sayagain:${method}`, (event, value) => {
      if (!trusted(event)) throw new Error('无效的页面来源');
      if (method !== 'state' && (!value || typeof value !== 'object' || Array.isArray(value))) throw new Error('无效的操作参数');
      if(method==='state')return {...service.state(),speech:speech.status()};
      return service[method](value);
    });
    for(const [method,handler] of Object.entries({speechSettings:value=>speech.configure(value),clearApiKey:()=>speech.clearKey(),revealApiKey:()=>speech.secrets.get(),listApiKeys:()=>speech.secrets.list(),synthesize:value=>speech.request(value),cancelSynthesis:value=>speech.cancel(value),speechStatus:()=>speech.status(),cloudPlatform:()=>shell.openExternal('https://platform.qianwenai.com/')}))ipcMain.handle(`sayagain:${method}`,(event,value)=>{if(!trusted(event))throw new Error('无效的页面来源');return handler(value);});
    ipcMain.handle('sayagain:speakerPipeline',async(event,input)=>{
      if(!trusted(event))throw Error('无效来源');
      if(input?.action==='status')return speakerPipeline.status();
      if(input?.action==='cancel')return speakerPipeline.cancel();
      if(input?.action==='session')return speakerPipeline.start({id:input.id,clip_ids:input.clip_ids,options:input.options});
      if(input?.action==='import'){
        if(speakerPipeline.status().state==='running')throw Error('已有任务正在运行');
        const result=await dialog.showOpenDialog(win,{title:'导入音频并分人拆条',properties:['openFile'],filters:[{name:'音频',extensions:['mp3','wav','m4a','flac','ogg','aac','opus']} ]});
        if(result.canceled)return null;
        return speakerPipeline.start({filename:result.filePaths[0],id:input.id,options:input.options});
      }
      throw Error('无效分段操作');
    });
    ipcMain.handle('sayagain:reanalyzeRecording',async(event,input)=>{
      if(!trusted(event))throw Error('无效来源');const models=require('./recording-models.cjs');
      const progress=stage=>p=>{if(!event.sender.isDestroyed())event.sender.send('sayagain:recording-analysis-progress',{id:input.id,stage,...p});};
      return models.transcribeAll(service,app.getPath('userData'),input,progress('transcribing'));
    });
    ipcMain.handle('sayagain:modelEvidenceCopy',(event,id)=>{
      if(!trusted(event))throw Error('无效来源');
      const record=require('../shared/model-evidence.js').records.find(record=>record.id===id);
      if(!record)throw Error('未知模型记录');
      clipboard.writeText(record.sha256);return true;
    });
    ipcMain.handle('sayagain:modelEvidenceSource',async(event,id)=>{
      if(!trusted(event))throw Error('无效来源');
      const sources=require('../shared/model-evidence.js').sources;
      if(typeof id!=='string'||!Object.hasOwn(sources,id))throw Error('未知模型来源');
      await shell.openExternal(sources[id].url);return true;
    });
    ipcMain.handle('sayagain:recordingModels',event=>{if(!trusted(event))throw Error('无效来源');return require('./recording-models.cjs').status(app.getPath('userData'));});
    ipcMain.handle('sayagain:transcribeRecording',async(event,input)=>{if(!trusted(event))throw Error('无效来源');return require('./recording-models.cjs').transcribe(service,app.getPath('userData'),input);});
    ipcMain.handle('sayagain:skillPackage',async(event,action)=>{
      if(!trusted(event))throw new Error('无效的页面来源');
      const bundle=require('./skill-package.cjs');
      if(action==='copy'){clipboard.writeText(await bundle.copyableSkill());return true;}
      if(action==='open'){const error=await shell.openPath(bundle.source);if(error)throw new Error(error);return true;}
      if(action==='export'){const result=await dialog.showOpenDialog(win,{title:'选择 Skill 导出位置',properties:['openDirectory','createDirectory']});if(result.canceled)return null;return bundle.exportSkill(result.filePaths[0]);}
      throw new Error('未知 Skill 操作');
    });
    ipcMain.handle('sayagain:fullscreen', (event, exit) => {
      if (!trusted(event)) throw new Error('无效的页面来源');
      win.setFullScreen(exit === true ? false : !win.isFullScreen());
    });
    ipcMain.handle('sayagain:backup', async event => {
      if (!trusted(event)) throw new Error('无效的页面来源');
      const result = await dialog.showOpenDialog(win, { title: '选择备份保存位置', properties: ['openDirectory', 'createDirectory'] });
      if (result.canceled) return null;
      return service.backup(path.join(result.filePaths[0], `SayAgain-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`));
    });
    session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
      callback(contents === win?.webContents && contents.getURL() === pageUrl && permission === 'media' && details.mediaTypes?.length > 0 && details.mediaTypes.every(type => type === 'audio'));
    });
    session.defaultSession.setPermissionCheckHandler((contents, permission, origin, details) => contents === win?.webContents && contents.getURL() === pageUrl && permission === 'media' && details.mediaType === 'audio');
    protocol.handle('sayagain-asset', async request => {
      try {
        const url = new URL(request.url);
        if (url.hostname !== 'audio' || !/^\/[0-9a-f]{32}$/.test(url.pathname) || !['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 404 });
        const asset = service.asset(url.pathname.slice(1));
        const size = (await fs.stat(asset.filename)).size;
        const headers = { 'Content-Type': asset.media_type, 'Accept-Ranges': 'bytes', 'Content-Length': String(size) };
        let start = 0, end = size - 1;
        const range = request.headers.get('Range');
        if (range) {
          const match = /^bytes=(\d*)-(\d*)$/.exec(range);
          if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
          if (match[1]) { start = Number(match[1]); if (match[2]) end = Math.min(Number(match[2]), end); }
          else start = Math.max(0, size - Number(match[2]));
          if (start > end || start >= size || !Number.isSafeInteger(start)) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
          headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
          headers['Content-Length'] = String(end - start + 1);
        }
        return new Response(request.method === 'HEAD' ? null : Readable.toWeb(createReadStream(asset.filename,{start,end})), { status: range ? 206 : 200, headers });
      } catch { return new Response(null, { status: 404 }); }
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
      { label: '截图', submenu: [{label: '截图与快捷键…', click: () => screenshots.openSettings()}] },
      { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
    ]));
    await createWindow();
    app.on('activate', () => { if (!win || win.isDestroyed()) createWindow(); });
  }).catch(error => { dialog.showErrorBox('SayAgain 无法启动', error.message); app.quit(); });
}
async function createWindow() {
  win = new BrowserWindow({ icon:iconPath, width: 1280, height: 880, minWidth: 620, minHeight: 540, title: 'HOTPOOR SayAgain', backgroundColor: '#ffffff', titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.on('will-attach-webview', event => event.preventDefault());
  win.on('enter-full-screen', () => win.webContents.send('sayagain:fullscreen-state', true));
  win.on('leave-full-screen', () => win.webContents.send('sayagain:fullscreen-state', false));
  win.on('closed', () => { win = null; });
  await win.loadFile(pagePath);
}
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit',event=>{if(speech&&!quitting){event.preventDefault();quitting=true;speech.close().finally(()=>app.quit());}});
app.on('will-quit', () => {speakerPipeline?.close();require('./recording-import.cjs').close();bridge?.close();service?.close();});
