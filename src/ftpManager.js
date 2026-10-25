const { EventEmitter } = require('events');
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

  async uploadFile(localPath, remotePath, onProgress) {
    try {
      if (!this.connectionManager || !this.isConnected) {
        throw new Error('Not connected to server');
      }

      // Wrap onProgress to also emit events
      const progressHandler = (progress) => {
        this.emit('progress', {
          type: 'upload',
          localPath,
          remotePath,
          ...progress
        });
        if (onProgress) onProgress(progress);
      };

      const result = await this.connectionManager.uploadFile(localPath, remotePath, progressHandler);
      return result;
    } catch (error) {
      console.error('FTPManager: Upload error:', error);
      throw error;
    }
  }

  async downloadFile(remotePath, localPath, onProgress) {
    try {
      if (!this.connectionManager || !this.isConnected) {
        throw new Error('Not connected to server');
      }

      // Wrap onProgress to also emit events
      const progressHandler = (progress) => {
        this.emit('progress', {
          type: 'download',
          remotePath,
          localPath,
          ...progress
        });
        if (onProgress) onProgress(progress);
      };

      const result = await this.connectionManager.downloadFile(remotePath, localPath, progressHandler);
      return result;
    } catch (error) {
      console.error('FTPManager: Download error:', error);
      throw error;
    }
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
