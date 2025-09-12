const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // FTP operations
  ftpConnect: (config) => ipcRenderer.invoke('ftp-connect', config),
  ftpDisconnect: () => ipcRenderer.invoke('ftp-disconnect'),
  ftpList: (path) => ipcRenderer.invoke('ftp-list', path),
  ftpUpload: (localPath, remotePath) => ipcRenderer.invoke('ftp-upload', localPath, remotePath),
  ftpDownload: (remotePath, localPath) => ipcRenderer.invoke('ftp-download', remotePath, localPath),
  ftpDelete: (path) => ipcRenderer.invoke('ftp-delete', path),
  ftpCreateDirectory: (path) => ipcRenderer.invoke('ftp-create-directory', path),
  ftpRename: (oldPath, newPath) => ipcRenderer.invoke('ftp-rename', oldPath, newPath),
  ftpGetStatus: () => ipcRenderer.invoke('ftp-get-status'),

  // Bookmark operations
  bookmarksGetAll: () => ipcRenderer.invoke('bookmarks-get-all'),
  bookmarksAdd: (bookmark) => ipcRenderer.invoke('bookmarks-add', bookmark),
  bookmarksUpdate: (id, bookmark) => ipcRenderer.invoke('bookmarks-update', id, bookmark),
  bookmarksDelete: (id) => ipcRenderer.invoke('bookmarks-delete', id),

  // Dialog operations
  dialogOpenFile: () => ipcRenderer.invoke('dialog-open-file'),
  dialogOpenDirectory: () => ipcRenderer.invoke('dialog-open-directory'),
  dialogSaveFile: (options) => ipcRenderer.invoke('dialog-save-file', options),

  // Menu events
  onMenuNewConnection: (callback) => ipcRenderer.on('menu-new-connection', callback),
  onMenuQuickConnect: (callback) => ipcRenderer.on('menu-quick-connect', callback),
  onMenuManageBookmarks: (callback) => ipcRenderer.on('menu-manage-bookmarks', callback),

  // Remove listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});
