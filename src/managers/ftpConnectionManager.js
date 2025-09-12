const Client = require('ssh2-sftp-client');
const ftp = require('basic-ftp');
const fs = require('fs');
const path = require('path');
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
      this.connectionInfo = {
        type: config.type,
        host: config.host,
        port: config.port,
        username: config.username,
        connectedAt: new Date()
      };

      console.log(`${config.type.toUpperCase()} connection successful`);
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
}

module.exports = FTPConnectionManager;
