const { EventEmitter } = require('events');
const path = require('path');
const ConnectionFactory = require('./managers/connectionFactory');

class FTPManager extends EventEmitter {
  constructor() {
    super();
    this.connectionManager = null;
    this.isConnected = false;
    this.connectionInfo = null;
  }

  async connect(config) {
    try {
      console.log('FTPManager: Starting connection with config type:', config.type);
      
      // Create appropriate connection manager
      this.connectionManager = ConnectionFactory.createConnection(config.type);
      
      // Map configuration to match what each manager expects
      const mappedConfig = this.mapConfiguration(config);
      
      // Connect using the appropriate manager
      await this.connectionManager.connect(mappedConfig);
      
      this.isConnected = true;
      
      // Use connectionInfo from the underlying manager if available
      if (this.connectionManager.connectionInfo) {
        this.connectionInfo = this.connectionManager.connectionInfo;
      } else {
        // Fallback for managers that don't set connectionInfo
        this.connectionInfo = {
          type: config.type,
          host: config.host,
          username: config.username,
          connected: true,
          connectedAt: new Date().toISOString()
        };
      }

      // Emit status change event
      this.emit('status-change', {
        connected: true,
        ...this.connectionInfo
      });

      console.log('FTPManager: Connection successful');
      return { success: true, message: 'Connected successfully' };
    } catch (error) {
      console.error('FTPManager: Connection failed:', error);
      this.isConnected = false;
      this.connectionManager = null;
      
      // Emit status change event for failed connection
      this.emit('status-change', {
        connected: false,
        error: error.message
      });
      
      throw error;
    }
  }

  async disconnect() {
    try {
      if (this.connectionManager && this.isConnected) {
        await this.connectionManager.disconnect();
      }
      
      this.isConnected = false;
      this.connectionManager = null;
      this.connectionInfo = null;
      
      // Emit status change event
      this.emit('status-change', {
        connected: false
      });
      
      console.log('FTPManager: Disconnected successfully');
      return { success: true };
    } catch (error) {
      console.error('FTPManager: Disconnect error:', error);
      throw error;
    }
  }

  async listDirectory(path = '/') {
    try {
      if (!this.connectionManager || !this.isConnected) {
        throw new Error('Not connected to server');
      }

      const files = await this.connectionManager.listDirectory(path);
      return files;
    } catch (error) {
      console.error('FTPManager: List directory error:', error);
      throw error;
    }
  }

  /**
   * Run a transfer and emit 'progress' events shaped for the transfer queue:
   * { id, type, fileName, transferred, total, progress, speed, status, error }.
   * Pass { track: false } for internal transfers (e.g. the query cache).
   */
  async transfer(type, remotePath, localPath, onProgress, { track = true } = {}) {
    if (!this.connectionManager || !this.isConnected) {
      throw new Error('Not connected to server');
    }

    const started = Date.now();
    const state = {
      id: `${type}-${started}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      fileName: path.basename(type === 'upload' ? localPath : remotePath),
      remotePath,
      localPath,
      transferred: 0,
      total: 0,
      progress: 0,
      speed: 0,
      status: 'transferring',
    };
    let lastEmit = 0;
    const emit = (force = false) => {
      if (!track) return;
      const now = Date.now();
      if (!force && now - lastEmit < 100) return; // at most ~10 updates/s
      lastEmit = now;
      this.emit('progress', { ...state });
    };

    const progressHandler = ({ transferred = 0, total = 0 }) => {
      state.transferred = transferred;
      state.total = total || state.total;
      state.progress = state.total ? Math.min(100, (transferred / state.total) * 100) : 0;
      state.speed = transferred / Math.max(0.001, (Date.now() - started) / 1000);
      emit();
      if (onProgress) onProgress({ transferred, total: state.total });
    };

    emit(true);
    try {
      const method = type === 'upload' ? 'uploadFile' : 'downloadFile';
      const args = type === 'upload' ? [localPath, remotePath] : [remotePath, localPath];
      const result = await this.connectionManager[method](...args, track || onProgress ? progressHandler : undefined);
      state.status = 'completed';
      state.progress = 100;
      state.transferred = state.total || state.transferred;
      emit(true);
      return result;
    } catch (error) {
      state.status = 'failed';
      state.error = error.message;
      emit(true);
      console.error(`FTPManager: ${type} error:`, error);
      throw error;
    }
  }

  uploadFile(localPath, remotePath, onProgress, options) {
    return this.transfer('upload', remotePath, localPath, onProgress, options);
  }

  downloadFile(remotePath, localPath, onProgress, options) {
    return this.transfer('download', remotePath, localPath, onProgress, options);
  }

  async deleteFile(remotePath, isDirectory = false) {
    try {
      if (!this.connectionManager || !this.isConnected) {
        throw new Error('Not connected to server');
      }

      const result = await this.connectionManager.deleteItem(remotePath, isDirectory);
      return result;
    } catch (error) {
      console.error('FTPManager: Delete error:', error);
      throw error;
    }
  }

  async rename(oldPath, newPath) {
    try {
      if (!this.connectionManager || !this.isConnected) {
        throw new Error('Not connected to server');
      }

      return await this.connectionManager.rename(oldPath, newPath);
    } catch (error) {
      console.error('FTPManager: Rename error:', error);
      throw error;
    }
  }

  async createDirectory(remotePath) {
    try {
      if (!this.connectionManager || !this.isConnected) {
        throw new Error('Not connected to server');
      }

      const result = await this.connectionManager.createDirectory(remotePath);
      return result;
    } catch (error) {
      console.error('FTPManager: Create directory error:', error);
      throw error;
    }
  }

  async previewFile(remotePath) {
    try {
      if (!this.connectionManager || !this.isConnected) {
        throw new Error('Not connected to server');
      }

      console.log(`FTPManager: Previewing file ${remotePath}`);
      const result = await this.connectionManager.previewFile(remotePath);
      return { success: true, data: result };
    } catch (error) {
      console.error('FTPManager: Preview error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Download a file and return its compact content-search index entry.
   * Runs in the main process so file bytes never cross IPC.
   */
  async extractContent(remotePath, knownSize) {
    if (!this.connectionManager || !this.isConnected) {
      throw new Error('Not connected to server');
    }
    return this.connectionManager.extractContent(remotePath, knownSize);
  }

  // Helper method to map configuration between different formats
  mapConfiguration(config) {
    const mapped = { ...config };

    // For S3, map the fields appropriately
    if (config.type === 's3') {
      mapped.accessKey = config.username;
      mapped.secretKey = config.password;
      mapped.endpoint = config.host;
      // Use bucket field first, then fall back to downloadFolder or extract from host
      mapped.bucket = config.bucket || config.downloadFolder || this.extractBucketFromHost(config.host);
      // Don't set a default region here - let S3Manager detect it from endpoint
      mapped.region = config.region;
    }

    return mapped;
  }

  // Helper to extract bucket name from S3 URLs
  extractBucketFromHost(host) {
    if (!host) return null;
    
    try {
      // Handle URLs like: https://s3.us.cloud-object-storage.appdomain.cloud/bucket-name
      if (host.includes('/')) {
        const url = new URL(host.startsWith('http') ? host : `https://${host}`);
        const pathParts = url.pathname.split('/').filter(part => part);
        return pathParts.length > 0 ? pathParts[0] : null;
      }
    } catch (error) {
      console.warn('Failed to parse bucket from host:', error);
    }
    
    return null;
  }

  getConnectionInfo() {
    return this.connectionInfo;
  }

  isConnectionActive() {
    return this.isConnected && this.connectionManager !== null;
  }

  getStatus() {
    return {
      connected: this.isConnectionActive(),
      ...(this.connectionInfo || {})
    };
  }
}

module.exports = FTPManager;
