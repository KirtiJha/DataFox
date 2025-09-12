const { Client } = require('basic-ftp');
const SftpClient = require('ssh2-sftp-client');
const path = require('path');
const fs = require('fs').promises;

class FTPManager {
  constructor() {
    this.client = null;
    this.sftpClient = null;
    this.isConnected = false;
    this.connectionType = null;
    this.currentConfig = null;
  }

  async connect(config) {
    try {
      if (this.isConnected) {
        await this.disconnect();
      }

      if (config.type === 'sftp') {
        this.sftpClient = new SftpClient();
        await this.sftpClient.connect({
          host: config.host,
          port: config.port || 22,
          username: config.username,
          password: config.password,
          privateKey: config.privateKey,
          passphrase: config.passphrase
        });
        this.connectionType = 'sftp';
      } else {
        this.client = new Client();
        await this.client.access({
          host: config.host,
          port: config.port || 21,
          user: config.username,
          password: config.password,
          secure: config.secure || false
        });
        this.connectionType = 'ftp';
      }

      this.isConnected = true;
      this.currentConfig = config;
      
      return {
        connected: true,
        type: this.connectionType,
        host: config.host,
        port: config.port
      };
    } catch (error) {
      this.isConnected = false;
      this.currentConfig = null;
      throw new Error(`Connection failed: ${error.message}`);
    }
  }

  async disconnect() {
    try {
      if (this.client) {
        this.client.close();
        this.client = null;
      }
      if (this.sftpClient) {
        await this.sftpClient.end();
        this.sftpClient = null;
      }
      this.isConnected = false;
      this.connectionType = null;
      this.currentConfig = null;
    } catch (error) {
      throw new Error(`Disconnect failed: ${error.message}`);
    }
  }

  async listDirectory(remotePath = '/') {
    if (!this.isConnected) {
      throw new Error('Not connected to server');
    }

    try {
      let files = [];

      if (this.connectionType === 'sftp') {
        const list = await this.sftpClient.list(remotePath);
        files = list.map(file => ({
          name: file.name,
          size: file.size,
          type: file.type === 'd' ? 'directory' : 'file',
          modifiedTime: new Date(file.modifyTime),
          permissions: file.rights ? file.rights.user + file.rights.group + file.rights.other : '755',
          isDirectory: file.type === 'd',
          isFile: file.type === '-'
        }));
      } else {
        const list = await this.client.list(remotePath);
        files = list.map(file => ({
          name: file.name,
          size: file.size,
          type: file.isDirectory ? 'directory' : 'file',
          modifiedTime: file.modifiedAt,
          permissions: file.permissions || '755',
          isDirectory: file.isDirectory,
          isFile: file.isFile
        }));
      }

      // Sort directories first, then files, both alphabetically
      files.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });

      return files;
    } catch (error) {
      throw new Error(`Failed to list directory: ${error.message}`);
    }
  }

  async uploadFile(localPath, remotePath) {
    if (!this.isConnected) {
      throw new Error('Not connected to server');
    }

    try {
      if (this.connectionType === 'sftp') {
        await this.sftpClient.put(localPath, remotePath);
      } else {
        await this.client.uploadFrom(localPath, remotePath);
      }
    } catch (error) {
      throw new Error(`Upload failed: ${error.message}`);
    }
  }

  async downloadFile(remotePath, localPath) {
    if (!this.isConnected) {
      throw new Error('Not connected to server');
    }

    try {
      if (this.connectionType === 'sftp') {
        await this.sftpClient.get(remotePath, localPath);
      } else {
        await this.client.downloadTo(localPath, remotePath);
      }
    } catch (error) {
      throw new Error(`Download failed: ${error.message}`);
    }
  }

  async deleteFile(remotePath) {
    if (!this.isConnected) {
      throw new Error('Not connected to server');
    }

    try {
      if (this.connectionType === 'sftp') {
        const stat = await this.sftpClient.stat(remotePath);
        if (stat.isDirectory()) {
          await this.sftpClient.rmdir(remotePath, true);
        } else {
          await this.sftpClient.delete(remotePath);
        }
      } else {
        // Check if it's a directory first
        try {
          await this.client.removeDir(remotePath);
        } catch {
          // If removing as directory fails, try as file
          await this.client.remove(remotePath);
        }
      }
    } catch (error) {
      throw new Error(`Delete failed: ${error.message}`);
    }
  }

  async createDirectory(remotePath) {
    if (!this.isConnected) {
      throw new Error('Not connected to server');
    }

    try {
      if (this.connectionType === 'sftp') {
        await this.sftpClient.mkdir(remotePath);
      } else {
        await this.client.ensureDir(remotePath);
      }
    } catch (error) {
      throw new Error(`Create directory failed: ${error.message}`);
    }
  }

  async rename(oldPath, newPath) {
    if (!this.isConnected) {
      throw new Error('Not connected to server');
    }

    try {
      if (this.connectionType === 'sftp') {
        await this.sftpClient.rename(oldPath, newPath);
      } else {
        await this.client.rename(oldPath, newPath);
      }
    } catch (error) {
      throw new Error(`Rename failed: ${error.message}`);
    }
  }

  getConnectionStatus() {
    return {
      connected: this.isConnected,
      type: this.connectionType,
      config: this.currentConfig
    };
  }
}

module.exports = FTPManager;
