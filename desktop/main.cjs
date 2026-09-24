const { app, BrowserWindow, ipcMain, protocol, dialog, session, Menu, net, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
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
let win, service, bridge, speech, quitting=false;
const pagePath = path.join(__dirname, '../renderer/index.html');
const pageUrl = pathToFileURL(pagePath).href;
const trusted = event => event.sender === win?.webContents && event.senderFrame === win.webContents.mainFrame && event.senderFrame.url === pageUrl;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win?.isMinimized()) win.restore(); win?.focus(); });
  app.whenReady().then(async () => {
    service = new Service(path.join(app.getPath('userData'), 'data'));
    const changed=()=>{if(win&&!win.isDestroyed())win.webContents.send('sayagain:data-changed');};
    bridge=await startBridge(service,app.getPath('userData'),changed);
    speech=new Speech(service,app.getPath('userData'),{secrets:createSecrets(app.getPath('userData')),fetch:(url,options)=>net.fetch(url,options),onChange:changed});
    const methods = ['setIntegration', 'state', 'saveSettings', 'addExpression', 'editExpression', 'saveVoice', 'archiveVoice', 'defaultVoice', 'defaultSample', 'addSample'];
    for (const method of methods) ipcMain.handle(`sayagain:${method}`, (event, value) => {
      if (!trusted(event)) throw new Error('无效的页面来源');
      if (method !== 'state' && (!value || typeof value !== 'object' || Array.isArray(value))) throw new Error('无效的操作参数');
      if(method==='state')return {...service.state(),speech:speech.status()};
      return service[method](value);
    });
    for(const [method,handler] of Object.entries({speechSettings:value=>speech.configure(value),clearApiKey:()=>speech.clearKey(),revealApiKey:()=>speech.secrets.get(),listApiKeys:()=>speech.secrets.list(),synthesize:value=>speech.request(value),cancelSynthesis:value=>speech.cancel(value),speechStatus:()=>speech.status(),cloudPlatform:()=>shell.openExternal('https://platform.qianwenai.com/')}))ipcMain.handle(`sayagain:${method}`,(event,value)=>{if(!trusted(event))throw new Error('无效的页面来源');return handler(value);});
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
        const bytes = await fs.readFile(asset.filename);
        const headers = { 'Content-Type': asset.media_type, 'Accept-Ranges': 'bytes', 'Content-Length': String(bytes.length) };
        let start = 0, end = bytes.length - 1;
        const range = request.headers.get('Range');
        if (range) {
          const match = /^bytes=(\d*)-(\d*)$/.exec(range);
          if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${bytes.length}` } });
          if (match[1]) { start = Number(match[1]); if (match[2]) end = Math.min(Number(match[2]), end); }
          else start = Math.max(0, bytes.length - Number(match[2]));
          if (start > end || start >= bytes.length || !Number.isSafeInteger(start)) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${bytes.length}` } });
          headers['Content-Range'] = `bytes ${start}-${end}/${bytes.length}`;
          headers['Content-Length'] = String(end - start + 1);
        }
        return new Response(request.method === 'HEAD' ? null : bytes.subarray(start, end + 1), { status: range ? 206 : 200, headers });
      } catch { return new Response(null, { status: 404 }); }
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
      { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
    ]));
    await createWindow();
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
  }).catch(error => { dialog.showErrorBox('SayAgain 无法启动', error.message); app.quit(); });
}
async function createWindow() {
  win = new BrowserWindow({ width: 1280, height: 880, minWidth: 620, minHeight: 540, title: 'HOTPOOR SayAgain', backgroundColor: '#ffffff', titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
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
app.on('will-quit', () => {bridge?.close();service?.close();});
