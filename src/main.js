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
            accelerator: "CmdOrCtrl+Q",
            click: () => {
              this.mainWindow.webContents.send("menu-quick-connect");
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
                this.mainWindow.webContents.send(
                  "import-bookmarks",
                  result.filePaths[0]
                );
              }
            },
          },
          {
            label: "Export Bookmarks",
            click: async () => {
              const result = await dialog.showSaveDialog(this.mainWindow, {
                filters: [{ name: "JSON Files", extensions: ["json"] }],
              });
              if (!result.canceled) {
                this.mainWindow.webContents.send(
                  "export-bookmarks",
                  result.filePath
                );
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
          { type: "separator" },
          {
            label: "Sync Folders",
            accelerator: "CmdOrCtrl+S",
            click: () => {
              this.mainWindow.webContents.send("menu-sync");
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
              this.mainWindow.webContents.send("menu-about");
            },
          },
          {
            label: "Learn More",
            click: () => {
              shell.openExternal(
                "https://github.com/your-repo/modern-ftp-client"
              );
            },
          },
        ],
      },
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }

  setupIPC() {
    // FTP Operations
    ipcMain.handle("ftp-connect", async (event, connectionData) => {
      try {
        console.log("IPC Handler: ftp-connect received:", connectionData);
        const result = await this.ftpManager.connect(connectionData);

        // Add connection info to the result for the frontend
        if (result.success) {
          result.data = this.ftpManager.getConnectionInfo();
        }

        console.log("IPC Handler: ftp-connect result:", result);
        return result;
      } catch (error) {
        console.error("IPC Handler: ftp-connect error:", error);
        throw error;
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

    ipcMain.handle("ftp-upload", async (event, localPath, remotePath) => {
      return await this.ftpManager.uploadFile(localPath, remotePath);
    });

    ipcMain.handle("ftp-download", async (event, remotePath, localPath) => {
      return await this.ftpManager.downloadFile(remotePath, localPath);
    });

    ipcMain.handle("ftp-delete", async (event, remotePath) => {
      return await this.ftpManager.deleteFile(remotePath);
    });

    // ipcMain.handle('ftp-rename', async (event, oldPath, newPath) => {
    //     return await this.ftpManager.rename(oldPath, newPath);
    // });

    ipcMain.handle("ftp-mkdir", async (event, remotePath) => {
      return await this.ftpManager.createDirectory(remotePath);
    });

    ipcMain.handle("ftp-create-directory", async (event, remotePath) => {
      return await this.ftpManager.createDirectory(remotePath);
    });

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

    // Bookmark Operations
    ipcMain.handle("bookmarks-get-all", async (event) => {
      try {
        console.log("Main process: bookmarks-get-all called");
        const result = await this.bookmarkManager.getAllBookmarks();
        console.log("Main process: getAllBookmarks result:", result);
        return result;
      } catch (error) {
        console.error("Main process: getAllBookmarks error:", error);
        throw error;
      }
    });

    ipcMain.handle("bookmarks-save", async (event, bookmark) => {
      try {
        console.log("Main process: bookmarks-save called with:", bookmark);
        const result = await this.bookmarkManager.saveBookmark(bookmark);
        console.log("Main process: bookmark save result:", result);
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

    ipcMain.handle("dialog-open-file", async (event) => {
      const result = await dialog.showOpenDialog(this.mainWindow, {
        properties: ["openFile"],
      });
      return result.canceled ? null : { filePath: result.filePaths[0] };
    });

    ipcMain.handle("dialog-save-file", async (event, options = {}) => {
      const result = await dialog.showSaveDialog(this.mainWindow, options);
      return result.canceled ? null : { filePath: result.filePath };
    });

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
    ipcMain.handle("path-join", (...args) => {
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
    ipcMain.handle(
      "index-save",
      async (event, indexData, customFileName = null) => {
        try {
          const userDataPath = app.getPath("userData");
          const fileName = customFileName || "search-indexes.json";
          const indexPath = path.join(userDataPath, fileName);

          console.log(`📁 User data path: ${userDataPath}`);
          console.log(`💾 Saving index to: ${indexPath}`);
          console.log(
            `📊 Index contains ${
              indexData.contentIndex?.length || indexData.totalCount || 0
            } entries`
          );

          await fs.ensureDir(path.dirname(indexPath));
          await fs.writeJson(indexPath, indexData, { spaces: 2 });

          console.log(`✅ Index saved successfully to: ${indexPath}`);
          return { success: true, path: indexPath };
        } catch (error) {
          console.error("❌ Failed to save index:", error);
          return { success: false, error: error.message };
        }
      }
    );

    ipcMain.handle("index-load", async (event, customFileName = null) => {
      try {
        const userDataPath = app.getPath("userData");
        const fileName = customFileName || "search-indexes.json";
        const indexPath = path.join(userDataPath, fileName);

        console.log(`📁 Looking for index at: ${indexPath}`);

        if (await fs.pathExists(indexPath)) {
          const indexData = await fs.readJson(indexPath);
          console.log(`✅ Index loaded from: ${indexPath}`);
          console.log(
            `📊 Loaded ${
              indexData.contentIndex?.length || indexData.totalCount || 0
            } entries`
          );
          return { success: true, data: indexData };
        } else {
          console.log(`❌ No existing index file found at: ${indexPath}`);
          return { success: true, data: null };
        }
      } catch (error) {
        console.error("❌ Failed to load index:", error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle("index-clear", async (event) => {
      try {
        const userDataPath = app.getPath("userData");
        const indexPath = path.join(userDataPath, "search-indexes.json");

        if (await fs.pathExists(indexPath)) {
          await fs.remove(indexPath);
          console.log(`Index cleared: ${indexPath}`);
        }

        return { success: true };
      } catch (error) {
        console.error("Failed to clear index:", error);
        return { success: false, error: error.message };
      }
    });

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

    // Parquet File Parsing
    ipcMain.handle("parse-parquet", async (event, arrayBuffer) => {
      try {
        console.log(
          `🔧 Main process: Parsing parquet file (${arrayBuffer.byteLength} bytes)`
        );

        // Import parquet library
        const parquetjs = require("@dsnp/parquetjs");

        // Convert ArrayBuffer to Buffer
        const buffer = Buffer.from(arrayBuffer);

        // Parse the parquet file
        const reader = await parquetjs.ParquetReader.openBuffer(buffer);
        const cursor = reader.getCursor();
        const records = [];
        let record;

        // Read all records - no artificial limits
        while ((record = await cursor.next())) {
          records.push(record);
        }

        await reader.close();

        console.log(
          `🔧 ✅ Main process parquet parsing successful: ${records.length} rows`
        );

        return {
          success: true,
          data: records,
          recordCount: records.length,
          fields: records.length > 0 ? Object.keys(records[0]) : [],
        };
      } catch (error) {
        console.error("❌ Main process parquet parsing failed:", error);
        return {
          success: false,
          error: error.message,
          data: null,
        };
      }
    });

    // Progress updates
    this.ftpManager.on("progress", (data) => {
      this.mainWindow.webContents.send("transfer-progress", data);
    });

    this.ftpManager.on("status-change", (status) => {
      this.mainWindow.webContents.send("connection-status", status);
    });
  }
}

// Initialize the application
new ModernFTPClient();
