const {
  app,
  BrowserWindow,
  Menu,
  dialog,
  ipcMain,
  shell,
} = require("electron");
const path = require("path");
const fs = require("fs-extra");
const FTPManager = require("./ftpManager");
const BookmarkManager = require("./bookmarkManager");
const MainSemanticSearchEngine = require("./mainSemanticSearchEngine");

class ModernFTPClient {
  constructor() {
    this.mainWindow = null;
    this.ftpManager = new FTPManager();
    this.bookmarkManager = new BookmarkManager();
    this.semanticSearchEngine = null;
    this.isDev =
      process.env.NODE_ENV === "development" ||
      process.argv.includes("--dev") ||
      !app.isPackaged;

    this.initializeApp();
  }

  initializeApp() {
    app.whenReady().then(() => {
      this.createMainWindow();
      this.setupMenu();
      this.setupIPC();
    });

    app.on("window-all-closed", () => {
      if (process.platform !== "darwin") {
        app.quit();
      }
    });

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createMainWindow();
      }
    });
  }

  createMainWindow() {
    this.mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      minWidth: 1000,
      minHeight: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, "preload.js"),
      },
      titleBarStyle: "hiddenInset",
      show: false,
      icon: path.join(__dirname, "../public/assets/icons/icon.png"),
    });

    // Load the Next.js development server in development, or the built files in production
    if (this.isDev) {
      this.mainWindow.loadURL("http://localhost:3000");
    } else {
      this.mainWindow.loadFile(path.join(__dirname, "../out/index.html"));
    }

    this.mainWindow.once("ready-to-show", () => {
      this.mainWindow.show();
    });

    if (this.isDev) {
      this.mainWindow.webContents.openDevTools();
    }
  }

  setupMenu() {
    const template = [
      {
        label: "File",
        submenu: [
          {
            label: "New Connection",
            accelerator: "CmdOrCtrl+N",
            click: () => {
              this.mainWindow.webContents.send("menu-new-connection");
            },
          },
          {
            label: "Quick Connect",
            accelerator: "CmdOrCtrl+K",
            click: () => {
              this.mainWindow.webContents.send("menu-quick-connect");
            },
          },
          {
            label: "Manage Bookmarks",
            accelerator: "CmdOrCtrl+Shift+B",
            click: () => {
              this.mainWindow.webContents.send("menu-manage-bookmarks");
            },
          },
          { type: "separator" },
          {
            label: "Import Bookmarks",
            click: async () => {
              const result = await dialog.showOpenDialog(this.mainWindow, {
                properties: ["openFile"],
                filters: [{ name: "JSON Files", extensions: ["json"] }],
              });
              if (!result.canceled) {
                await this.importBookmarks(result.filePaths[0]);
              }
            },
          },
          {
            label: "Export Bookmarks",
            click: async () => {
              const result = await dialog.showSaveDialog(this.mainWindow, {
                defaultPath: "datafox-bookmarks.json",
                filters: [{ name: "JSON Files", extensions: ["json"] }],
              });
              if (!result.canceled && result.filePath) {
                await this.exportBookmarks(result.filePath);
              }
            },
          },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      {
        label: "Edit",
        submenu: [
          { role: "undo" },
          { role: "redo" },
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { role: "selectall" },
        ],
      },
      {
        label: "View",
        submenu: [
          { role: "reload" },
          { role: "forceReload" },
          { role: "toggleDevTools" },
          { type: "separator" },
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
          { type: "separator" },
          { role: "togglefullscreen" },
        ],
      },
      {
        label: "Transfer",
        submenu: [
          {
            label: "Upload Files",
            accelerator: "CmdOrCtrl+U",
            click: () => {
              this.mainWindow.webContents.send("menu-upload");
            },
          },
          {
            label: "Download Files",
            accelerator: "CmdOrCtrl+D",
            click: () => {
              this.mainWindow.webContents.send("menu-download");
            },
          },
        ],
      },
      {
        label: "Window",
        submenu: [{ role: "minimize" }, { role: "close" }],
      },
      {
        label: "Help",
        submenu: [
          {
            label: "About",
            click: () => {
              dialog.showMessageBox(this.mainWindow, {
                type: "info",
                title: "About DataFox",
                message: `DataFox ${app.getVersion()}`,
                detail:
                  "A modern client for FTP, FTPS, SFTP and S3 with content search.\n\n" +
                  `Electron ${process.versions.electron} · Chrome ${process.versions.chrome} · Node ${process.versions.node}`,
              });
            },
          },
          {
            label: "Learn More",
            click: () => {
              shell.openExternal(
                "https://github.com/kirtijha/datafox"
              );
            },
          },
        ],
      },
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }

  async importBookmarks(filePath) {
    const result = await this.bookmarkManager.importBookmarks(filePath);
    if (result.success) {
      this.mainWindow.webContents.send("bookmarks-changed");
      await dialog.showMessageBox(this.mainWindow, {
        type: result.errors ? "warning" : "info",
        message: `Imported ${result.importedCount} bookmark${result.importedCount === 1 ? "" : "s"}`,
        detail: [
          "Passwords are not included in exported files; enter them when you first connect.",
          ...(result.errors || []),
        ].join("\n"),
      });
    } else {
      dialog.showErrorBox("Import failed", result.error);
    }
  }

  async exportBookmarks(filePath) {
    const result = await this.bookmarkManager.exportBookmarks(filePath);
    if (result.success) {
      await dialog.showMessageBox(this.mainWindow, {
        type: "info",
        message: `Exported ${result.count} bookmark${result.count === 1 ? "" : "s"}`,
        detail: "Passwords and keys were left out of the file.",
      });
    } else {
      dialog.showErrorBox("Export failed", result.error);
    }
  }

  // Index/cache files live directly in userData; reject anything that could
  // escape it (e.g. "../../somewhere.json") coming from the renderer.
  resolveIndexPath(customFileName) {
    const fileName = customFileName || "search-indexes.json";
    if (
      path.basename(fileName) !== fileName ||
      !/^[\w.-]+\.json$/.test(fileName)
    ) {
      throw new Error(`Invalid index file name: ${fileName}`);
    }
    return path.join(app.getPath("userData"), fileName);
  }

  // Wrap an operation so the renderer always gets { success, ... } instead of a rejected promise.
  async respond(operation) {
    try {
      const result = await operation();
      return result && typeof result === "object" && "success" in result
        ? result
        : { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  setupIPC() {
    // FTP Operations
    ipcMain.handle("ftp-connect", async (event, connectionData) => {
      try {
        const result = await this.ftpManager.connect(connectionData);

        // Add connection info to the result for the frontend
        if (result.success) {
          result.data = this.ftpManager.getConnectionInfo();
        }

        return result;
      } catch (error) {
        console.error("IPC Handler: ftp-connect error:", error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle("ftp-disconnect", async (event) => {
      return await this.ftpManager.disconnect();
    });

    ipcMain.handle("ftp-list", async (event, path) => {
      try {
        console.log(`[IPC Handler] ftp-list requested for path: ${path}`);
        const files = await this.ftpManager.listDirectory(path);
        console.log(
          `[IPC Handler] ftp-list result: ${files.length} files found`
        );
        return { success: true, data: files };
      } catch (error) {
        console.error(`[IPC Handler] ftp-list error:`, error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle("ftp-upload", (event, localPath, remotePath) =>
      this.respond(() => this.ftpManager.uploadFile(localPath, remotePath))
    );

    ipcMain.handle("ftp-download", (event, remotePath, localPath) =>
      this.respond(() => this.ftpManager.downloadFile(remotePath, localPath))
    );

    ipcMain.handle("ftp-delete", (event, remotePath, isDirectory = false) =>
      this.respond(() => this.ftpManager.deleteFile(remotePath, isDirectory))
    );

    ipcMain.handle("ftp-rename", (event, oldPath, newPath) =>
      this.respond(() => this.ftpManager.rename(oldPath, newPath))
    );

    ipcMain.handle("ftp-mkdir", (event, remotePath) =>
      this.respond(() => this.ftpManager.createDirectory(remotePath))
    );

    ipcMain.handle("ftp-create-directory", (event, remotePath) =>
      this.respond(() => this.ftpManager.createDirectory(remotePath))
    );

    ipcMain.handle("ftp-get-status", async (event) => {
      return this.ftpManager.getStatus();
    });

    ipcMain.handle("ftp-preview", async (event, remotePath) => {
      try {
        console.log(`[IPC Handler] ftp-preview requested for: ${remotePath}`);
        const result = await this.ftpManager.previewFile(remotePath);
        console.log(
          `[IPC Handler] ftp-preview result: ${
            result.success ? "success" : "failed"
          }`
        );

        // Return the result directly since it already has the proper structure
        return result;
      } catch (error) {
        console.error(`[IPC Handler] ftp-preview error:`, error);
        return { success: false, error: error.message };
      }
    });

    // Content indexing: download + extract in the main process, return only the index entry
    ipcMain.handle("ftp-extract-content", (event, remotePath, knownSize) =>
      this.respond(() => this.ftpManager.extractContent(remotePath, knownSize))
    );

    // Bookmark Operations
    ipcMain.handle("bookmarks-get-all", async (event) => {
      try {
        const result = await this.bookmarkManager.getAllBookmarks();
        return result;
      } catch (error) {
        console.error("Main process: getAllBookmarks error:", error);
        throw error;
      }
    });

    ipcMain.handle("bookmarks-save", async (event, bookmark) => {
      try {
        const result = await this.bookmarkManager.saveBookmark(bookmark);
        return result;
      } catch (error) {
        console.error("Main process: bookmark save error:", error);
        throw error;
      }
    });

    ipcMain.handle("bookmarks-delete", async (event, id) => {
      return this.bookmarkManager.deleteBookmark(id);
    });

    ipcMain.handle("bookmarks-update", async (event, bookmark) => {
      return this.bookmarkManager.updateBookmark(bookmark);
    });

    // File System Operations
    ipcMain.handle("fs-select-folder", async (event) => {
      const result = await dialog.showOpenDialog(this.mainWindow, {
        properties: ["openDirectory"],
      });
      return result.canceled ? null : result.filePaths[0];
    });

    ipcMain.handle("fs-select-files", async (event) => {
      const result = await dialog.showOpenDialog(this.mainWindow, {
        properties: ["openFile", "multiSelections"],
      });
      return result.canceled ? [] : result.filePaths;
    });

    // Dialogs return Electron's native { canceled, filePaths } / { canceled, filePath } shapes
    ipcMain.handle("dialog-open-file", (event, options = {}) =>
      dialog.showOpenDialog(this.mainWindow, {
        properties: ["openFile"],
        ...options,
      })
    );

    ipcMain.handle("dialog-open-files", (event, options = {}) =>
      dialog.showOpenDialog(this.mainWindow, {
        properties: ["openFile", "multiSelections"],
        ...options,
      })
    );

    ipcMain.handle("dialog-open-directory", (event, options = {}) =>
      dialog.showOpenDialog(this.mainWindow, {
        properties: ["openDirectory", "createDirectory"],
        ...options,
      })
    );

    ipcMain.handle("dialog-save-file", (event, options = {}) =>
      dialog.showSaveDialog(this.mainWindow, options)
    );

    ipcMain.handle("fs-list-directory", async (event, dirPath) => {
      try {
        const items = await fs.readdir(dirPath, { withFileTypes: true });
        return items.map((item) => ({
          name: item.name,
          isDirectory: item.isDirectory(),
          isFile: item.isFile(),
          path: path.join(dirPath, item.name),
        }));
      } catch (error) {
        throw error;
      }
    });

    ipcMain.handle("fs-get-stats", async (event, filePath) => {
      try {
        const stats = await fs.stat(filePath);
        return {
          size: stats.size,
          mtime: stats.mtime,
          isDirectory: stats.isDirectory(),
          isFile: stats.isFile(),
        };
      } catch (error) {
        throw error;
      }
    });

    // Path utilities for renderer process
    ipcMain.handle("path-join", (event, ...args) => {
      return path.join(...args);
    });

    ipcMain.handle("path-basename", (event, filePath) => {
      return path.basename(filePath);
    });

    ipcMain.handle("path-dirname", (event, filePath) => {
      return path.dirname(filePath);
    });

    ipcMain.handle("path-extname", (event, filePath) => {
      return path.extname(filePath);
    });

    // Index Storage Operations
    ipcMain.handle("index-save", async (event, indexData, customFileName = null) => {
      try {
        const indexPath = this.resolveIndexPath(customFileName);
        await fs.ensureDir(path.dirname(indexPath));
        // Write to a temp file and rename so a crash never leaves a half-written index.
        const tempPath = `${indexPath}.${process.pid}.tmp`;
        await fs.writeJson(tempPath, indexData);
        await fs.move(tempPath, indexPath, { overwrite: true });
        return { success: true, path: indexPath };
      } catch (error) {
        console.error("❌ Failed to save index:", error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle("index-load", async (event, customFileName = null) => {
      try {
        const indexPath = this.resolveIndexPath(customFileName);
        if (!(await fs.pathExists(indexPath))) {
          return { success: true, data: null };
        }
        return { success: true, data: await fs.readJson(indexPath) };
      } catch (error) {
        console.error("❌ Failed to load index:", error);
        return { success: false, error: error.message };
      }
    });

    const removeIndexFile = async (event, customFileName = null) => {
      try {
        await fs.remove(this.resolveIndexPath(customFileName));
        return { success: true };
      } catch (error) {
        console.error("Failed to remove index:", error);
        return { success: false, error: error.message };
      }
    };
    ipcMain.handle("index-clear", removeIndexFile);
    ipcMain.handle("index-delete", removeIndexFile);

    // System Operations
    ipcMain.handle("get-user-data-path", async (event) => {
      try {
        const userDataPath = app.getPath("userData");
        console.log("get-user-data-path called, returning:", userDataPath);
        return userDataPath;
      } catch (error) {
        console.error("Failed to get user data path:", error);
        throw error;
      }
    });

    // Semantic Search Operations
    ipcMain.handle("semantic-search-initialize", async (event) => {
      try {
        if (!this.semanticSearchEngine) {
          const userDataPath = app.getPath("userData");
          this.semanticSearchEngine = new MainSemanticSearchEngine(
            userDataPath
          );
        }

        const isReady = await this.semanticSearchEngine.initialize();
        console.log("Semantic search initialization result:", isReady);
        return { success: true, isReady };
      } catch (error) {
        console.error("Failed to initialize semantic search:", error);
        return { success: false, error: error.message, isReady: false };
      }
    });

    ipcMain.handle(
      "semantic-search-add-file",
      async (event, filePath, content, fileStats) => {
        try {
          if (!this.semanticSearchEngine) {
            return { success: false, error: "Semantic search not initialized" };
          }

          const result = await this.semanticSearchEngine.addFileEmbedding(
            filePath,
            content,
            fileStats
          );
          return { success: result };
        } catch (error) {
          console.error("Failed to add file to semantic search:", error);
          return { success: false, error: error.message };
        }
      }
    );

    ipcMain.handle(
      "semantic-search-query",
      async (event, query, limit = 10) => {
        try {
          if (!this.semanticSearchEngine) {
            return {
              success: false,
              error: "Semantic search not initialized",
              results: [],
            };
          }

          const results = await this.semanticSearchEngine.searchSemantic(
            query,
            limit
          );
          return { success: true, results };
        } catch (error) {
          console.error("Failed to perform semantic search:", error);
          return { success: false, error: error.message, results: [] };
        }
      }
    );

    ipcMain.handle("semantic-search-get-stats", async (event) => {
      try {
        if (!this.semanticSearchEngine) {
          return {
            success: false,
            stats: { totalFiles: 0, totalChunks: 0, isReady: false },
          };
        }

        const stats = await this.semanticSearchEngine.getStats();
        return { success: true, stats };
      } catch (error) {
        console.error("Failed to get semantic search stats:", error);
        return {
          success: false,
          stats: { totalFiles: 0, totalChunks: 0, isReady: false },
        };
      }
    });

    // Progress updates
    const sendToRenderer = (channel, data) => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send(channel, data);
      }
    };

    this.ftpManager.on("progress", (data) => {
      sendToRenderer("transfer-progress", data);
    });

    this.ftpManager.on("status-change", (status) => {
      sendToRenderer("connection-status", status);
    });
  }
}

// Initialize the application
new ModernFTPClient();
