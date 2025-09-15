const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const FTPManager = require('./ftpManager');
const S3Manager = require('../managers/s3Manager');
const BookmarkManager = require('./bookmarkManager');

let mainWindow;
let ftpManager;
let s3Manager;
let bookmarkManager;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    },
    titleBarStyle: 'hiddenInset',
    show: false,
    icon: path.join(__dirname, '../../assets/icon.png')
  });

  // Load the Next.js app in development or the built app in production
  const url = isDev 
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, '../../out/index.html')}`;

  console.log('isDev:', isDev);
  console.log('Loading URL:', url);
  
  mainWindow.loadURL(url);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Initialize managers
  ftpManager = new FTPManager();
  s3Manager = new S3Manager();
  bookmarkManager = new BookmarkManager();

  setupMenu();
}

// Helper function to get the currently connected manager
function getActiveManager() {
  if (ftpManager.isConnected) return ftpManager;
  if (s3Manager.isConnected) return s3Manager;
  throw new Error('No active connection');
}

function setupMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Connection',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow.webContents.send('menu-new-connection');
          }
        },
        {
          label: 'Quick Connect',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            mainWindow.webContents.send('menu-quick-connect');
          }
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'actualSize' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Bookmarks',
      submenu: [
        {
          label: 'Manage Bookmarks',
          accelerator: 'CmdOrCtrl+B',
          click: () => {
            mainWindow.webContents.send('menu-manage-bookmarks');
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// App event handlers
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handlers for FTP operations
ipcMain.handle('ftp-connect', async (event, config) => {
  try {
    let result, connectionInfo;
    
    // Determine which manager to use based on connection type
    if (config.type === 's3' || config.protocol === 's3') {
      result = await s3Manager.connect(config);
      connectionInfo = s3Manager.connectionInfo;
    } else {
      result = await ftpManager.connect(config);
      connectionInfo = ftpManager.connectionInfo;
    }
    
    return { success: true, data: connectionInfo };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ftp-disconnect', async () => {
  try {
    // Disconnect from both managers (only the connected one will actually disconnect)
    await ftpManager.disconnect();
    await s3Manager.disconnect();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ftp-list', async (event, path = '/') => {
  try {
    const manager = getActiveManager();
    const files = await manager.listDirectory(path);
    return { success: true, data: files };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ftp-upload', async (event, localPath, remotePath) => {
  try {
    const manager = getActiveManager();
    await manager.uploadFile(localPath, remotePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ftp-download', async (event, remotePath, localPath) => {
  try {
    const manager = getActiveManager();
    await manager.downloadFile(remotePath, localPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ftp-delete', async (event, path) => {
  try {
    const manager = getActiveManager();
    await manager.deleteFile(path);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ftp-create-directory', async (event, path) => {
  try {
    const manager = getActiveManager();
    await manager.createDirectory(path);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ftp-rename', async (event, oldPath, newPath) => {
  try {
    const manager = getActiveManager();
    await manager.rename(oldPath, newPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ftp-preview', async (event, remotePath) => {
  try {
    const manager = getActiveManager();
    const content = await manager.previewFile(remotePath);
    return { success: true, data: content };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ftp-get-status', () => {
  return ftpManager.isConnected || s3Manager.isConnected;
});

// IPC handlers for bookmarks
ipcMain.handle('bookmarks-get-all', () => {
  return bookmarkManager.getBookmarks();
});

ipcMain.handle('bookmarks-add', (event, bookmark) => {
  return bookmarkManager.addBookmark(bookmark);
});

ipcMain.handle('bookmarks-update', (event, id, bookmark) => {
  return bookmarkManager.updateBookmark(id, bookmark);
});

ipcMain.handle('bookmarks-delete', (event, id) => {
  return bookmarkManager.deleteBookmark(id);
});

// File dialog handlers
ipcMain.handle('dialog-open-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  return result;
});

ipcMain.handle('dialog-open-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  return result;
});

ipcMain.handle('dialog-save-file', async (event, options = {}) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: options.defaultPath || 'download',
    filters: options.filters || [
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  return result;
});

// System Operations
ipcMain.handle('get-user-data-path', () => {
  return app.getPath('userData');
});
