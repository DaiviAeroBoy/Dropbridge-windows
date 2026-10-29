const { app, BrowserWindow, Tray, Menu, shell, nativeImage } = require('electron');
const path = require('path'), net = require('net');
const icon = path.join(__dirname, 'build', 'icon.png');
let win, tray, quitting = false, told = false;

const freePort = () => new Promise(ok => {
  const s = net.createServer();
  s.once('error', () => { const t = net.createServer(); t.listen(0, () => { const p = t.address().port; t.close(() => ok(p)); }); });
  s.listen(3000, '0.0.0.0', () => s.close(() => ok(3000)));
});
const show = () => { if (win) { win.show(); win.focus(); } };

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', show);
  app.on('before-quit', () => { quitting = true; });
  app.on('window-all-closed', () => {});
  app.whenReady().then(async () => {
    const port = await freePort();
    process.env.PORT = String(port);
    process.env.OPEN = '0';
    process.env.DATA_DIR = path.join(app.getPath('userData'), 'data');
    require('./server.js');

    const url = 'http://localhost:' + port;
    win = new BrowserWindow({ width: 1000, height: 720, minWidth: 420, backgroundColor: '#F4F7FC', autoHideMenuBar: true, icon, title: 'DropBridge' });
    win.webContents.on('did-fail-load', () => setTimeout(() => win.loadURL(url), 300));
    win.webContents.setWindowOpenHandler(({ url: u }) => { shell.openExternal(u); return { action: 'deny' }; });
    win.webContents.on('will-navigate', (e, u) => { if (!u.startsWith(url)) { e.preventDefault(); shell.openExternal(u); } });
    win.loadURL(url);
    win.on('close', e => {
      if (quitting) return;
      e.preventDefault(); win.hide();
      if (!told && tray) { told = true; tray.displayBalloon({ title: 'DropBridge is still running', content: 'It stays in the tray so your phone can keep sending. Right-click the icon to quit.' }); }
    });

    tray = new Tray(nativeImage.createFromPath(icon).resize({ width: 16, height: 16 }));
    tray.setToolTip('DropBridge');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open DropBridge', click: show },
      { label: 'Start with Windows', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: i => app.setLoginItemSettings({ openAtLogin: i.checked }) },
      { type: 'separator' },
      { label: 'Quit', click: () => { quitting = true; app.quit(); } }
    ]));
    tray.on('click', show);
  });
}
