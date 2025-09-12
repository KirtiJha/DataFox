const FTPConnectionManager = require('./ftpManager');
const S3ConnectionManager = require('./s3Manager');

class ConnectionManagerFactory {
  /**
   * Create a connection manager based on the connection type
   * @param {string} type - Connection type (ftp, ftps, sftp, s3)
   * @returns {BaseConnectionManager} Connection manager instance
   */
  static createManager(type) {
    switch (type.toLowerCase()) {
      case 'ftp':
      case 'ftps':
      case 'sftp':
        return new FTPConnectionManager();
      
      case 's3':
        return new S3ConnectionManager();
      
      default:
        throw new Error(`Unsupported connection type: ${type}`);
    }
  }

  /**
   * Get supported connection types
   * @returns {Array<string>} Supported connection types
   */
  static getSupportedTypes() {
    return ['ftp', 'ftps', 'sftp', 's3'];
  }

  /**
   * Check if a connection type is supported
   * @param {string} type - Connection type to check
   * @returns {boolean} Whether the type is supported
   */
  static isTypeSupported(type) {
    return this.getSupportedTypes().includes(type.toLowerCase());
  }
}

module.exports = ConnectionManagerFactory;
