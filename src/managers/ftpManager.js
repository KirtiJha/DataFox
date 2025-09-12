const Client = require('ssh2-sftp-client');
const ftp = require('basic-ftp');
const fs = require('fs');
const path = require('path');
const parquet = require('@dsnp/parquetjs');
const BaseConnectionManager = require('./baseManager');

class FTPConnectionManager extends BaseConnectionManager {
  constructor() {
    super();
    this.client = null;
    this.protocol = null;
  }

  async connect(config) {
    try {
      console.log('Connecting to FTP/SFTP server...', {
        host: config.host,
        port: config.port,
        protocol: config.type,
        username: config.username
      });

      this.protocol = config.type;

      if (config.type === 'sftp') {
        // SFTP Connection
        this.client = new Client();
        const connectOptions = {
          host: config.host,
          port: config.port || 22,
          username: config.username,
          password: config.password,
          readyTimeout: 20000,
          retries: 2
        };

        // Add private key if provided
        if (config.privateKey) {
          connectOptions.privateKey = config.privateKey;
          if (config.passphrase) {
            connectOptions.passphrase = config.passphrase;
          }
        }

        await this.client.connect(connectOptions);
      } else {
        // FTP/FTPS Connection
        this.client = new ftp.Client();
        
        const connectOptions = {
          host: config.host,
          port: config.port || 21,
          user: config.username,
          password: config.password,
          secure: config.type === 'ftps' || config.secure
        };

        await this.client.access(connectOptions);
      }

      this.isConnected = true;
    // Store connection info
    this.connectionInfo = {
      host: config.host,
      port: config.port,
      username: config.username,
      name: config.name || `${config.host}:${config.port}`
    };      console.log(`${config.type.toUpperCase()} connection successful`);
      return { success: true, message: `Connected to ${config.type.toUpperCase()} server successfully` };

    } catch (error) {
      console.error('FTP/SFTP connection failed:', error);
      this.isConnected = false;
      throw new Error(`${config.type.toUpperCase()} connection failed: ${error.message}`);
    }
  }

  async disconnect() {
    try {
      if (this.client) {
        if (this.protocol === 'sftp') {
          await this.client.end();
        } else {
          this.client.close();
        }
      }
      
      this.isConnected = false;
      this.connectionInfo = {};
      this.client = null;
      this.protocol = null;

      console.log('FTP/SFTP disconnected successfully');
      return { success: true, message: 'Disconnected successfully' };
    } catch (error) {
      console.error('FTP/SFTP disconnect error:', error);
      throw new Error(`Disconnect failed: ${error.message}`);
    }
  }

  async listDirectory(directoryPath = '/') {
    try {
      if (!this.isConnected || !this.client) {
        throw new Error('Not connected to server');
      }

      let files;

      if (this.protocol === 'sftp') {
        // SFTP directory listing
        const rawFiles = await this.client.list(directoryPath);
        files = rawFiles.map(file => this.formatFileInfo({
          name: file.name,
          size: file.size,
          type: file.type === 'd' ? 'folder' : 'file',
          isDirectory: file.type === 'd',
          modifiedAt: new Date(file.modifyTime),
          permissions: file.rights ? file.rights.user + file.rights.group + file.rights.other : '',
          owner: file.owner || '',
          group: file.group || ''
        }));
      } else {
        // FTP directory listing
        const rawFiles = await this.client.list(directoryPath);
        files = rawFiles.map(file => this.formatFileInfo({
          name: file.name,
          size: file.size,
          type: file.isDirectory ? 'folder' : 'file',
          isDirectory: file.isDirectory,
          modifiedAt: file.modifiedAt || new Date(),
          permissions: file.permissions || '',
          owner: '',
          group: ''
        }));
      }

      // Filter out . and .. entries
      files = files.filter(file => file.name !== '.' && file.name !== '..');

      console.log(`Listed ${files.length} items in ${directoryPath}`);
      return files;

    } catch (error) {
      console.error('Directory listing error:', error);
      throw new Error(`Failed to list directory: ${error.message}`);
    }
  }

  async uploadFile(localPath, remotePath) {
    try {
      if (!this.isConnected || !this.client) {
        throw new Error('Not connected to server');
      }

      if (this.protocol === 'sftp') {
        // SFTP upload
        await this.client.put(localPath, remotePath);
      } else {
        // FTP upload
        await this.client.uploadFrom(localPath, remotePath);
      }

      console.log('File uploaded successfully:', remotePath);
      return { success: true, message: 'File uploaded successfully' };

    } catch (error) {
      console.error('Upload error:', error);
      throw new Error(`Upload failed: ${error.message}`);
    }
  }

  async downloadFile(remotePath, localPath) {
    try {
      if (!this.isConnected || !this.client) {
        throw new Error('Not connected to server');
      }

      if (this.protocol === 'sftp') {
        // SFTP download
        await this.client.get(remotePath, localPath);
      } else {
        // FTP download
        await this.client.downloadTo(localPath, remotePath);
      }

      console.log('File downloaded successfully:', localPath);
      return { success: true, message: 'File downloaded successfully' };

    } catch (error) {
      console.error('Download error:', error);
      throw new Error(`Download failed: ${error.message}`);
    }
  }

  async deleteItem(itemPath, isDirectory = false) {
    try {
      if (!this.isConnected || !this.client) {
        throw new Error('Not connected to server');
      }

      if (this.protocol === 'sftp') {
        // SFTP delete
        if (isDirectory) {
          await this.client.rmdir(itemPath, true); // true for recursive
        } else {
          await this.client.delete(itemPath);
        }
      } else {
        // FTP delete
        if (isDirectory) {
          await this.client.removeDir(itemPath);
        } else {
          await this.client.remove(itemPath);
        }
      }

      console.log(`${isDirectory ? 'Directory' : 'File'} deleted successfully:`, itemPath);
      return { success: true, message: `${isDirectory ? 'Directory' : 'File'} deleted successfully` };

    } catch (error) {
      console.error('Delete error:', error);
      throw new Error(`Delete failed: ${error.message}`);
    }
  }

  async createDirectory(dirPath) {
    try {
      if (!this.isConnected || !this.client) {
        throw new Error('Not connected to server');
      }

      if (this.protocol === 'sftp') {
        // SFTP create directory
        await this.client.mkdir(dirPath, true); // true for recursive
      } else {
        // FTP create directory
        await this.client.ensureDir(dirPath);
      }

      console.log('Directory created successfully:', dirPath);
      return { success: true, message: 'Directory created successfully' };

    } catch (error) {
      console.error('Create directory error:', error);
      throw new Error(`Create directory failed: ${error.message}`);
    }
  }

  async previewFile(filePath) {
    try {
      if (!this.isConnected || !this.client) {
        throw new Error('Not connected to server');
      }

      const fileExtension = path.extname(filePath).toLowerCase();
      let content;
      let fileStats;
      let buffer;

      if (this.protocol === 'sftp') {
        // SFTP preview
        // First check file size
        fileStats = await this.client.stat(filePath);
        
        // Check file size (limit to 10MB for preview)
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (fileStats.size > maxSize) {
          throw new Error('File too large for preview (max 10MB)');
        }

        // Get file content as buffer
        buffer = await this.client.get(filePath);
        
      } else {
        // FTP preview
        // For FTP, we need to download to a temporary buffer
        // Unfortunately, basic-ftp doesn't have a direct way to get file stats
        // So we'll try to download and check size during download
        
        const chunks = [];
        let totalSize = 0;
        const maxSize = 10 * 1024 * 1024; // 10MB
        
        try {
          await this.client.downloadTo((chunk) => {
            totalSize += chunk.length;
            if (totalSize > maxSize) {
              throw new Error('File too large for preview (max 10MB)');
            }
            chunks.push(chunk);
          }, filePath);
          
          buffer = Buffer.concat(chunks);
          fileStats = { size: totalSize, modifiedAt: new Date() };
        } catch (error) {
          if (error.message.includes('too large')) {
            throw error;
          }
          throw new Error('Failed to download file for preview');
        }
      }

      // Process the buffer based on file type
      if (fileExtension === '.parquet') {
        // Handle Parquet files
        try {
          // Create a temporary file to read the parquet data
          const tempFilePath = path.join(__dirname, '../../tmp', `preview-${Date.now()}.parquet`);
          
          // Ensure tmp directory exists
          const tmpDir = path.dirname(tempFilePath);
          if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
          }
          
          // Write buffer to temporary file
          fs.writeFileSync(tempFilePath, buffer);
          
          // Read parquet file
          const reader = await parquet.ParquetReader.openFile(tempFilePath);
          
          // Get schema - handle case where schema might not be available
          let schemaInfo = [];
          try {
            const schema = reader.getSchema();
            if (schema && schema.fieldList) {
              schemaInfo = schema.fieldList.map(field => ({
                name: field.name,
                type: field.primitiveType || field.originalType || 'unknown'
              }));
            }
          } catch (schemaError) {
            console.log("Schema read error, continuing without schema info:", schemaError.message);
          }
          
          // Read rows for preview - don't rely on getRowCount
          const cursor = reader.getCursor();
          const rows = [];
          let record = null;
          let count = 0;
          
          try {
            while (count < 100 && (record = await cursor.next())) {
              rows.push(record);
              count++;
            }
          } catch (readError) {
            console.log("Row reading stopped at row", count, ":", readError.message);
          }
          
          await reader.close();
          
          // Clean up temporary file
          fs.unlinkSync(tempFilePath);
          
          // Convert to JSON for display
          content = JSON.stringify({
            schema: schemaInfo,
            rowCount: `${rows.length}+ rows (preview only)`,
            columnCount: schemaInfo.length || (rows.length > 0 ? Object.keys(rows[0]).length : 0),
            previewRows: rows,
            message: `Showing first ${rows.length} rows successfully read`,
            fileInfo: {
              fileName: path.basename(filePath),
              fileSize: fileStats.size
            }
          }, null, 2);
          
        } catch (parquetError) {
          console.error("Parquet parsing error:", parquetError);
          
          // Fallback: try to provide basic file info without parsing
          content = JSON.stringify({
            error: "Unable to parse Parquet file",
            message: "This Parquet file format may not be supported for preview",
            fileName: path.basename(filePath),
            fileSize: fileStats.size,
            suggestion: "Please download the file to view its contents with a specialized Parquet viewer",
            details: parquetError.message
          }, null, 2);
        }
      } else {
        // Handle text files (JSON, CSV, TXT, etc.)
        try {
          content = buffer.toString('utf-8');
        } catch (error) {
          throw new Error('File contains binary data and cannot be previewed');
        }
      }

      console.log('FTP file preview successful:', filePath);
      return {
        success: true,
        content: content,
        fileName: path.basename(filePath),
        fileSize: fileStats.size,
        lastModified: fileStats.modifiedAt || fileStats.mtime || new Date(),
      };
    } catch (error) {
      console.error('FTP preview error:', error);
      throw new Error(`FTP preview failed: ${error.message}`);
    }
  }
}

module.exports = FTPConnectionManager;
