const Client = require('ssh2-sftp-client');
const ftp = require('basic-ftp');
const fs = require('fs');
const { Writable } = require('stream');
const BaseConnectionManager = require('./baseManager');

class FTPConnectionManager extends BaseConnectionManager {
  constructor() {
    super();
    this.client = null;
    this.protocol = null;
    // basic-ftp runs one command at a time per connection, so FTP operations
    // (user actions and background indexing) are chained through this queue.
    this.ftpQueue = Promise.resolve();
  }

  /**
   * Run an operation against the client. FTP operations are serialized;
   * SFTP supports concurrent requests over one connection.
   */
  run(operation) {
    if (!this.isConnected || !this.client) {
      return Promise.reject(new Error('Not connected to server'));
    }

    if (this.protocol === 'sftp') {
      return operation(this.client);
    }

    const result = this.ftpQueue.then(() => {
      if (!this.client) throw new Error('Not connected to server');
      return operation(this.client);
    });
    // Keep the queue alive even when an operation fails.
    this.ftpQueue = result.catch(() => {});
    return result;
  }

  resolvePrivateKey(privateKey) {
    if (!privateKey) return undefined;
    // The connection form stores a path chosen via file dialog; ssh2 expects key contents.
    if (!privateKey.includes('-----BEGIN') && fs.existsSync(privateKey)) {
      return fs.readFileSync(privateKey);
    }
    return privateKey;
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
        const privateKey = this.resolvePrivateKey(config.privateKey);
        if (privateKey) {
          connectOptions.privateKey = privateKey;
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
      this.ftpQueue = Promise.resolve();
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

  parseFtpDate(file) {
    if (file.modifiedAt) return file.modifiedAt;
    if (!file.rawModifiedAt) return null;
    const parsed = new Date(file.rawModifiedAt);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  async listDirectory(directoryPath = '/') {
    try {
      const rawFiles = await this.run((client) => client.list(directoryPath));
      let files;

      if (this.protocol === 'sftp') {
        files = rawFiles.map(file => this.formatFileInfo({
          name: file.name,
          size: file.size,
          type: file.type === 'd' ? 'folder' : 'file',
          isDirectory: file.type === 'd',
          modifiedAt: file.modifyTime ? new Date(file.modifyTime) : null,
          permissions: file.rights ? file.rights.user + file.rights.group + file.rights.other : '',
          owner: file.owner || '',
          group: file.group || ''
        }));
      } else {
        files = rawFiles.map(file => this.formatFileInfo({
          name: file.name,
          size: file.size,
          type: file.isDirectory ? 'folder' : 'file',
          isDirectory: file.isDirectory,
          modifiedAt: this.parseFtpDate(file),
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

  /**
   * Run a basic-ftp transfer with byte progress. trackProgress is per client,
   * which is safe because FTP operations are serialized.
   */
  async ftpTransfer(client, total, onProgress, transfer) {
    if (onProgress) {
      client.trackProgress((info) => onProgress({ transferred: info.bytes, total }));
    }
    try {
      return await transfer();
    } finally {
      client.trackProgress();
    }
  }

  /**
   * SFTP transfers use fastGet/fastPut for progress reporting; some servers
   * reject their parallel requests, so fall back to get/put without progress.
   */
  async sftpTransfer(fast, plain, onProgress) {
    if (!onProgress) return this.run(plain);
    try {
      return await this.run((client) =>
        fast(client, {
          step: (transferred, chunk, total) => onProgress({ transferred, total }),
        })
      );
    } catch (error) {
      console.warn('SFTP fast transfer failed, retrying without progress:', error.message);
      return this.run(plain);
    }
  }

  async uploadFile(localPath, remotePath, onProgress) {
    try {
      if (this.protocol === 'sftp') {
        await this.sftpTransfer(
          (client, options) => client.fastPut(localPath, remotePath, options),
          (client) => client.put(localPath, remotePath),
          onProgress
        );
      } else {
        const total = fs.statSync(localPath).size;
        await this.run((client) =>
          this.ftpTransfer(client, total, onProgress, () => client.uploadFrom(localPath, remotePath))
        );
      }

      console.log('File uploaded successfully:', remotePath);
      return { success: true, message: 'File uploaded successfully' };

    } catch (error) {
      console.error('Upload error:', error);
      throw new Error(`Upload failed: ${error.message}`);
    }
  }

  async downloadFile(remotePath, localPath, onProgress) {
    try {
      if (this.protocol === 'sftp') {
        await this.sftpTransfer(
          (client, options) => client.fastGet(remotePath, localPath, options),
          (client) => client.get(remotePath, localPath),
          onProgress
        );
      } else {
        await this.run(async (client) => {
          const total = onProgress ? await client.size(remotePath).catch(() => 0) : 0;
          return this.ftpTransfer(client, total, onProgress, () => client.downloadTo(localPath, remotePath));
        });
      }

      console.log('File downloaded successfully:', localPath);
      return { success: true, message: 'File downloaded successfully' };

    } catch (error) {
      console.error('Download error:', error);
      throw new Error(`Download failed: ${error.message}`);
    }
  }

  async getFileSize(remotePath) {
    if (this.protocol === 'sftp') {
      const stats = await this.run((client) => client.stat(remotePath));
      return stats.size;
    }
    return this.run((client) => client.size(remotePath));
  }

  async readFile(remotePath) {
    if (this.protocol === 'sftp') {
      // With no destination, ssh2-sftp-client resolves to a Buffer.
      return this.run((client) => client.get(remotePath));
    }

    const chunks = [];
    const sink = new Writable({
      write(chunk, encoding, callback) {
        chunks.push(chunk);
        callback();
      }
    });
    await this.run((client) => client.downloadTo(sink, remotePath));
    return Buffer.concat(chunks);
  }

  async previewFile(remotePath) {
    try {
      return await super.previewFile(remotePath);
    } catch (error) {
      console.error('Preview error:', error);
      throw new Error(`Preview failed: ${error.message}`);
    }
  }

  async rename(oldPath, newPath) {
    try {
      await this.run((client) => client.rename(oldPath, newPath));
      console.log(`Renamed ${oldPath} -> ${newPath}`);
      return { success: true, message: 'Renamed successfully' };
    } catch (error) {
      console.error('Rename error:', error);
      throw new Error(`Rename failed: ${error.message}`);
    }
  }

  async deleteItem(itemPath, isDirectory = false) {
    try {
      if (this.protocol === 'sftp') {
        if (isDirectory) {
          await this.run((client) => client.rmdir(itemPath, true)); // true for recursive
        } else {
          await this.run((client) => client.delete(itemPath));
        }
      } else {
        if (isDirectory) {
          await this.run((client) => client.removeDir(itemPath));
        } else {
          await this.run((client) => client.remove(itemPath));
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
      if (this.protocol === 'sftp') {
        await this.run((client) => client.mkdir(dirPath, true)); // true for recursive
      } else {
        // ensureDir changes the working directory, so restore it afterwards.
        await this.run(async (client) => {
          const cwd = await client.pwd();
          await client.ensureDir(dirPath);
          await client.cd(cwd);
        });
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
