const FtpManager = require('./ftpConnectionManager');
const S3Manager = require('./s3Manager');

class ConnectionFactory {
  static createConnection(type) {
    console.log('ConnectionFactory: Creating connection for type:', type);
    
    switch (type.toLowerCase()) {
      case 'ftp':
      case 'ftps':
      case 'sftp':
        console.log('ConnectionFactory: Creating FTP/SFTP manager');
        return new FtpManager();
      
      case 's3':
        console.log('ConnectionFactory: Creating S3 manager');
        return new S3Manager();
      
      default:
        throw new Error(`Unsupported connection type: ${type}`);
    }
  }
}

module.exports = ConnectionFactory;
