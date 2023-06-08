/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import path from 'path';
import { app, BrowserWindow, shell, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';
import { exec } from 'child_process';
import { parse } from 'plist';
import { readdirRecursive } from './readdirRecursive';
import { importImages } from './importImages';

class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

let mainWindow: BrowserWindow | null = null;

function readDiskutil() {
  return new Promise((resolve, reject) => {
    exec('diskutil list -plist', (err, stdout, stderr) => {
      if (err) {
        reject(err);
        return;
      }

      if (stderr) {
        reject(stderr);
        return;
      }

      const result = parse(stdout);

      resolve(result);
    });
  });
}

ipcMain.handle('listDrives', () => {
  return readDiskutil();
});

ipcMain.handle('openFile', (event, arg) => {
  if (typeof arg !== 'string' || !arg) {
    return Promise.reject(new Error('Invalid openFile disk prop'));
  }
  return shell.openExternal('file:' + arg);
});

ipcMain.handle('unmountDisk', (event, arg) => {
  if (typeof arg !== 'string' || !arg) {
    return Promise.reject(new Error('Invalid unmountDisk disk prop'));
  }

  return new Promise((resolve, reject) => {
    exec('diskutil unmountdisk ' + arg, (err, stdout, stderr) => {
      if (err) {
        reject(err);
        return;
      }

      if (stderr) {
        reject(stderr);
        return;
      }

      resolve(stdout);
    });
  });
});

ipcMain.handle('fetchDriveFiles', (event, driveName) => {
  if (typeof driveName !== 'string' || !driveName) {
    return Promise.reject(new Error('Invalid fetchDriveInfo disk prop'));
  }

  return readdirRecursive(driveName);
});

ipcMain.on('startImport', async (event, arg) => {
  if (typeof arg !== 'string' || !arg) {
    return Promise.reject(new Error('Invalid startImport disk prop'));
  }

  event.reply('importStatus', {
    progress: 0,
    message: 'Hämtar lista på filer...',
  });

  await new Promise((resolve) => setTimeout(resolve, 200));

  try {
    const files = await readdirRecursive(arg);

    await importImages(files, (progress, message) => {
      event.reply('importStatus', { progress, message });
    });
  } catch (error) {
    event.reply('importStatus', {
      progress: 100,
      message: error instanceof Error ? error.message : String(error),
      success: false,
    });
  }
});

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug')();
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload
    )
    .catch(console.log);
};

const createWindow = async () => {
  if (isDebug) {
    await installExtensions();
  }

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  mainWindow = new BrowserWindow({
    show: false,
    width: 512,
    height: 728,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      webSecurity: false,
      sandbox: false,
      nodeIntegration: true,
      //contextIsolation: false,

      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
  });

  mainWindow.loadURL(resolveHtmlPath('index.html'));

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  // Remove this if your app does not use auto updates
  // eslint-disable-next-line
  new AppUpdater();
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app
  .whenReady()
  .then(() => {
    createWindow();
    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (mainWindow === null) createWindow();
    });
  })
  .catch(console.log);
