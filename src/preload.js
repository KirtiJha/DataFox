const { contextBridge, ipcRenderer } = require("electron");

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electronAPI", {
  // FTP Operations
  ftpConnect: (connectionData) =>
    ipcRenderer.invoke("ftp-connect", connectionData),
  ftpDisconnect: () => ipcRenderer.invoke("ftp-disconnect"),
  ftpList: (path) => ipcRenderer.invoke("ftp-list", path),
  ftpUpload: (localPath, remotePath) =>
    ipcRenderer.invoke("ftp-upload", localPath, remotePath),
  ftpDownload: (remotePath, localPath) =>
    ipcRenderer.invoke("ftp-download", remotePath, localPath),
  ftpDelete: (remotePath, isDirectory = false) =>
    ipcRenderer.invoke("ftp-delete", remotePath, isDirectory),
  ftpRename: (oldPath, newPath) =>
    ipcRenderer.invoke("ftp-rename", oldPath, newPath),
  ftpMkdir: (remotePath) => ipcRenderer.invoke("ftp-mkdir", remotePath),
  ftpGetStatus: () => ipcRenderer.invoke("ftp-get-status"),
  ftpPreview: (filePath) => ipcRenderer.invoke("ftp-preview", filePath),
  ftpExtractContent: (remotePath, knownSize) =>
    ipcRenderer.invoke("ftp-extract-content", remotePath, knownSize),

  // SQL queries over remote files
  queryOpen: (target) => ipcRenderer.invoke("query-open", target),
  queryRun: (sessionId, sql, limit) =>
    ipcRenderer.invoke("query-run", sessionId, sql, limit),
  queryProfile: (sessionId) => ipcRenderer.invoke("query-profile", sessionId),
  queryExport: (sessionId, sql, format, suggestedName) =>
    ipcRenderer.invoke("query-export", sessionId, sql, format, suggestedName),
  queryCancel: (sessionId) => ipcRenderer.invoke("query-cancel", sessionId),
  queryClose: (sessionId) => ipcRenderer.invoke("query-close", sessionId),
  queryClearCache: () => ipcRenderer.invoke("query-clear-cache"),
  onQueryProgress: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on("query-progress", listener);
    return () => ipcRenderer.removeListener("query-progress", listener);
  },

  // Bookmark Operations
  bookmarksGetAll: () => ipcRenderer.invoke("bookmarks-get-all"),
  bookmarksAdd: (bookmark) => ipcRenderer.invoke("bookmarks-save", bookmark),
  bookmarksSave: (bookmark) => ipcRenderer.invoke("bookmarks-save", bookmark),
  bookmarksDelete: (id) => ipcRenderer.invoke("bookmarks-delete", id),
  bookmarksUpdate: (bookmark) =>
    ipcRenderer.invoke("bookmarks-update", bookmark),

  // File System Operations
  fsSelectFolder: () => ipcRenderer.invoke("fs-select-folder"),
  fsSelectFiles: () => ipcRenderer.invoke("fs-select-files"),
  fsListDirectory: (dirPath) =>
    ipcRenderer.invoke("fs-list-directory", dirPath),
  fsGetStats: (filePath) => ipcRenderer.invoke("fs-get-stats", filePath),

  // Dialog Operations
  dialogOpenFile: (options) => ipcRenderer.invoke("dialog-open-file", options),
  dialogOpenFiles: (options) =>
    ipcRenderer.invoke("dialog-open-files", options),
  dialogOpenDirectory: (options) =>
    ipcRenderer.invoke("dialog-open-directory", options),
  dialogSaveFile: (options) => ipcRenderer.invoke("dialog-save-file", options),

  // Additional FTP Operations
  ftpCreateDirectory: (remotePath) =>
    ipcRenderer.invoke("ftp-create-directory", remotePath),

  // Index Storage Operations
  indexSave: (indexData, customFileName = null) =>
    ipcRenderer.invoke("index-save", indexData, customFileName),
  indexLoad: (customFileName = null) =>
    ipcRenderer.invoke("index-load", customFileName),
  indexClear: (customFileName = null) =>
    ipcRenderer.invoke("index-clear", customFileName),
  indexDelete: (customFileName) =>
    ipcRenderer.invoke("index-delete", customFileName),

  // Semantic Search Operations
  semanticSearchInitialize: () =>
    ipcRenderer.invoke("semantic-search-initialize"),
  semanticSearchAddFile: (filePath, content, fileStats) =>
    ipcRenderer.invoke(
      "semantic-search-add-file",
      filePath,
      content,
      fileStats
    ),
  semanticSearchQuery: (query, limit) =>
    ipcRenderer.invoke("semantic-search-query", query, limit),
  semanticSearchGetStats: () => ipcRenderer.invoke("semantic-search-get-stats"),

  // System Operations
  getUserDataPath: () => ipcRenderer.invoke("get-user-data-path"),

  // Event Listeners
  onTransferProgress: (callback) => {
    ipcRenderer.on("transfer-progress", (event, data) => callback(data));
  },
  onConnectionStatus: (callback) => {
    ipcRenderer.on("connection-status", (event, data) => callback(data));
  },
  onMenuAction: (action, callback) => {
    ipcRenderer.on(`menu-${action}`, callback);
  },

  // Specific Menu Event Listeners (for backward compatibility)
  onMenuNewConnection: (callback) => {
    ipcRenderer.on("menu-new-connection", callback);
  },
  onMenuQuickConnect: (callback) => {
    ipcRenderer.on("menu-quick-connect", callback);
  },
  onMenuManageBookmarks: (callback) => {
    ipcRenderer.on("menu-manage-bookmarks", callback);
  },
  onMenuUpload: (callback) => {
    ipcRenderer.on("menu-upload", callback);
  },
  onMenuDownload: (callback) => {
    ipcRenderer.on("menu-download", callback);
  },
  onBookmarksChanged: (callback) => {
    ipcRenderer.on("bookmarks-changed", callback);
  },

  // Remove listeners
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
});

// Expose some Node.js modules that are safe to use in the renderer
contextBridge.exposeInMainWorld("nodeAPI", {
  // Path utilities (delegated to main process)
  path: {
    join: (...args) => ipcRenderer.invoke("path-join", ...args),
    basename: (filePath) => ipcRenderer.invoke("path-basename", filePath),
    dirname: (filePath) => ipcRenderer.invoke("path-dirname", filePath),
    extname: (filePath) => ipcRenderer.invoke("path-extname", filePath),
    sep: process.platform === "win32" ? "\\" : "/",
  },

  // Utility functions
  formatBytes: (bytes, decimals = 2) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  },

  formatDate: (date) => {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(date));
  },

  generateId: () => {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  },
});
