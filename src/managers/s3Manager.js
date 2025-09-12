const {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
const fs = require("fs");
const path = require("path");
const parquet = require("@dsnp/parquetjs");
const BaseConnectionManager = require("./baseManager");

class S3ConnectionManager extends BaseConnectionManager {
  constructor() {
    super();
    this.s3Client = null;
    this.bucket = null;
    this.region = null;
  }

  async connect(config) {
    try {
      // Parse configuration for IBM Cloud Object Storage
      let bucket = config.bucket;
      let endpoint = config.endpoint || config.host;

      // Handle various IBM Cloud Object Storage URL formats
      if (endpoint && endpoint.includes("/")) {
        try {
          const url = new URL(
            endpoint.startsWith("http") ? endpoint : `https://${endpoint}`
          );
          const pathParts = url.pathname.split("/").filter((part) => part);
          if (pathParts.length > 0 && !bucket) {
            bucket = pathParts[0];
          }
          endpoint = url.origin;
        } catch (error) {
          console.warn("Failed to parse endpoint URL:", error);
        }
      }

      // Ensure we have a bucket name
      if (!bucket) {
        if (config.path && config.path !== "/") {
          bucket = config.path.replace(/^\/+|\/+$/g, ""); // Remove leading/trailing slashes
        } else {
          throw new Error(
            "Bucket name is required. Please specify it in the Download Folder field."
          );
        }
      }

      // Ensure we have an endpoint
      if (!endpoint) {
        throw new Error(
          "S3 endpoint is required. Please specify the server address."
        );
      }

      // Clean up endpoint - remove https:// if present for IBM Cloud compatibility
      if (endpoint.startsWith("https://")) {
        endpoint = endpoint.substring(8);
      }
      if (endpoint.startsWith("http://")) {
        endpoint = endpoint.substring(7);
      }

      this.bucket = bucket;

      // Determine region from endpoint for IBM Cloud Object Storage
      let detectedRegion = "us-south"; // Default for IBM Cloud
      if (endpoint.includes("cloud-object-storage.appdomain.cloud")) {
        if (endpoint.includes("s3.us-south.")) detectedRegion = "us-south";
        else if (endpoint.includes("s3.us-east.")) detectedRegion = "us-east";
        else if (endpoint.includes("s3.us."))
          detectedRegion = "us"; // Keep 'us' as is for IBM Cloud
        else if (endpoint.includes("s3.eu-gb.")) detectedRegion = "eu-gb";
        else if (endpoint.includes("s3.eu-de.")) detectedRegion = "eu-de";
        else if (endpoint.includes("s3.ap-")) detectedRegion = "ap-southeast-1";
      }

      this.region = config.region || detectedRegion;
      this.endpoint = endpoint;

      console.log("Connecting to S3...", {
        bucket: this.bucket,
        region: this.region,
        endpoint: this.endpoint,
      });

      console.log("Parsed S3 config:", {
        bucket: this.bucket,
        region: this.region,
        endpoint: this.endpoint,
        accessKey: (config.username || config.accessKey || '').trim().substring(0, 8) + "...",
        hasSecretKey: !!(config.password || config.secretKey),
        secretKeyLength: (config.password || config.secretKey || '').trim().length,
        secretKeyPrefix: (config.password || config.secretKey || '').trim().substring(0, 8) + "...",
        originalSecretKeyLength: (config.password || config.secretKey || '').length,
        hadWhitespace: (config.password || config.secretKey || '').length !== (config.password || config.secretKey || '').trim().length
      });

      // Configure S3 client for IBM Cloud Object Storage
      const s3Config = {
        region: this.region,
        credentials: {
          accessKeyId: (config.username || config.accessKey || '').trim(),
          secretAccessKey: (config.password || config.secretKey || '').trim(),
        },
        requestTimeout: 60000, // Increased to 60 seconds for IBM Cloud
        connectionTimeout: 30000,
        maxAttempts: 2,
        retryDelayOptions: {
          customBackoff: function (retryCount) {
            return Math.pow(2, retryCount) * 1000; // Exponential backoff
          },
        },
      };

      // IBM Cloud Object Storage specific configuration
      if (
        endpoint &&
        endpoint.includes("cloud-object-storage.appdomain.cloud")
      ) {
        s3Config.endpoint = `https://${endpoint}`;
        s3Config.forcePathStyle = true;
        s3Config.s3ForcePathStyle = true;
        s3Config.signatureVersion = "v4";
        s3Config.s3DisableBodySigning = false;

        // IBM Cloud specific headers
        s3Config.customUserAgent = "DataFox-FTP-Client/1.0";
      } else if (endpoint && !endpoint.includes("amazonaws.com")) {
        // Other S3-compatible services
        s3Config.endpoint = endpoint.startsWith("https://")
          ? endpoint
          : `https://${endpoint}`;
        s3Config.forcePathStyle = true;
        s3Config.s3ForcePathStyle = true;
      }

      this.s3Client = new S3Client(s3Config);

      // Test connection by listing bucket contents with timeout
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        MaxKeys: 1,
      });

      const result = await Promise.race([
        this.s3Client.send(command),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Connection timeout after 30 seconds")),
            30000
          )
        ),
      ]);

      console.log("S3 connection successful");

      this.isConnected = true;
      this.connectionInfo = {
        type: "s3",
        bucket: this.bucket,
        region: this.region,
        endpoint: this.endpoint,
        name: config.name || config.nickname || this.bucket,
        connectedAt: new Date(),
      };

      console.log("S3 connection successful");
      return { success: true, message: "Connected to S3 successfully" };
    } catch (error) {
      console.error("S3 connection failed:", error);
      this.isConnected = false;
      throw new Error(`S3 connection failed: ${error.message}`);
    }
  }

  async disconnect() {
    try {
      if (this.s3Client) {
        // S3 client doesn't need explicit disconnection
        this.s3Client = null;
      }
      this.isConnected = false;
      this.connectionInfo = {};
      this.bucket = null;
      this.region = null;

      console.log("S3 disconnected successfully");
      return { success: true, message: "Disconnected from S3" };
    } catch (error) {
      console.error("S3 disconnect error:", error);
      throw new Error(`S3 disconnect failed: ${error.message}`);
    }
  }

  async listDirectory(prefix = "") {
    try {
      if (!this.isConnected || !this.s3Client) {
        throw new Error("Not connected to S3");
      }

      // Remove leading slash for S3
      let cleanPrefix = prefix.startsWith("/") ? prefix.substring(1) : prefix;
      
      // For subdirectories, ensure the prefix ends with "/" unless it's the root
      if (cleanPrefix && !cleanPrefix.endsWith("/")) {
        cleanPrefix += "/";
      }

      console.log(
        `S3 listDirectory: prefix="${prefix}", cleanPrefix="${cleanPrefix}", bucket="${this.bucket}"`
      );

      // Get the main directory listing
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: cleanPrefix,
        Delimiter: "/",
      });

      const response = await this.s3Client.send(command);
      console.log("S3 listDirectory response:", {
        CommonPrefixes: response.CommonPrefixes?.length || 0,
        Contents: response.Contents?.length || 0,
        IsTruncated: response.IsTruncated,
        Prefix: cleanPrefix
      });

      const files = [];

      // Get folder counts efficiently in a single call
      const folderCounts = await this.getFolderCounts(cleanPrefix, response.CommonPrefixes);

      // Add directories (common prefixes) with file counts
      if (response.CommonPrefixes) {
        for (const commonPrefix of response.CommonPrefixes) {
          const folderName = commonPrefix.Prefix.replace(cleanPrefix, "").replace("/", "");
          if (folderName) {
            console.log(`Found directory: ${folderName}`);
            
            const fileCount = folderCounts[commonPrefix.Prefix] || 0;
            console.log(`Folder ${folderName} contains ${fileCount} items`);
            
            files.push(
              this.formatFileInfo({
                name: folderName,
                size: 0,
                fileCount: fileCount,
                type: "folder",
                isDirectory: true,
                modifiedAt: new Date(),
                permissions: "drwxr-xr-x",
                owner: "owner",
                group: "group",
              })
            );
          }
        }
      }

      // Add files
      if (response.Contents) {
        for (const object of response.Contents) {
          // Skip the current directory entry and directory markers
          if (object.Key === cleanPrefix || object.Key.endsWith("/")) continue;

          const fileName = object.Key.replace(cleanPrefix, "");
          if (fileName && !fileName.includes("/")) {
            console.log(`Found file: ${fileName}`);
            files.push(
              this.formatFileInfo({
                name: fileName,
                size: object.Size || 0,
                type: "file",
                isDirectory: false,
                modifiedAt: object.LastModified || new Date(),
                permissions: "-rw-r--r--",
                owner: "owner",
                group: "group",
                etag: object.ETag,
              })
            );
          }
        }
      }

      console.log(`S3 listed ${files.length} items in ${prefix || "root"}`);
      return files;
    } catch (error) {
      console.error("S3 list directory error:", error);
      throw new Error(`Failed to list S3 directory: ${error.message}`);
    }
  }

  // More efficient method to get folder counts
  async getFolderCounts(parentPrefix, commonPrefixes) {
    const folderCounts = {};
    
    if (!commonPrefixes || commonPrefixes.length === 0) {
      return folderCounts;
    }

    // Feature flag: disable file counting for performance
    const ENABLE_FILE_COUNTING = false; // Set to true to enable counting
    
    if (!ENABLE_FILE_COUNTING) {
      console.log("File counting disabled for performance");
      return folderCounts;
    }

    try {
      console.log(`Getting folder counts for ${commonPrefixes.length} folders`);
      
      // For performance, we'll do a simplified count
      // This is much faster than individual API calls for each folder
      for (const commonPrefix of commonPrefixes) {
        try {
          const fileCount = await this.countItemsInFolder(commonPrefix.Prefix);
          folderCounts[commonPrefix.Prefix] = fileCount;
        } catch (error) {
          console.warn(`Failed to count items in ${commonPrefix.Prefix}:`, error);
          folderCounts[commonPrefix.Prefix] = 0;
        }
      }
    } catch (error) {
      console.warn("Error getting folder counts:", error);
    }

    return folderCounts;
  }

  // Helper method to count items in a folder
  async countItemsInFolder(folderPrefix) {
    try {
      console.log(`Counting items in folder: ${folderPrefix}`);
      
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: folderPrefix,
        Delimiter: "/",
      });

      const response = await this.s3Client.send(command);
      
      // Count direct children only (files + subfolders)
      const fileCount = (response.Contents || []).filter(obj => 
        obj.Key !== folderPrefix && !obj.Key.endsWith("/")
      ).length;
      
      const folderCount = (response.CommonPrefixes || []).length;
      
      const totalCount = fileCount + folderCount;
      console.log(`Folder ${folderPrefix}: ${fileCount} files + ${folderCount} folders = ${totalCount} total`);
      
      return totalCount;
    } catch (error) {
      console.warn(`Failed to count items in folder ${folderPrefix}:`, error);
      return 0; // Return 0 if counting fails
    }
  }

  async uploadFile(localPath, remotePath) {
    try {
      if (!this.isConnected || !this.s3Client) {
        throw new Error("Not connected to S3");
      }

      // Remove leading slash for S3
      const cleanRemotePath = remotePath.startsWith("/")
        ? remotePath.substring(1)
        : remotePath;

      const fileStream = fs.createReadStream(localPath);
      const fileName = path.basename(localPath);

      const upload = new Upload({
        client: this.s3Client,
        params: {
          Bucket: this.bucket,
          Key: cleanRemotePath,
          Body: fileStream,
          ContentType: this.getContentType(fileName),
        },
      });

      // Track upload progress
      upload.on("httpUploadProgress", (progress) => {
        console.log(
          `Upload progress: ${progress.loaded}/${progress.total} bytes`
        );
      });

      const result = await upload.done();

      console.log("S3 file uploaded successfully:", cleanRemotePath);
      return {
        success: true,
        message: "File uploaded successfully",
        path: cleanRemotePath,
        etag: result.ETag,
      };
    } catch (error) {
      console.error("S3 upload error:", error);
      throw new Error(`S3 upload failed: ${error.message}`);
    }
  }

  async downloadFile(remotePath, localPath) {
    try {
      if (!this.isConnected || !this.s3Client) {
        throw new Error("Not connected to S3");
      }

      // Remove leading slash for S3
      const cleanRemotePath = remotePath.startsWith("/")
        ? remotePath.substring(1)
        : remotePath;

      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: cleanRemotePath,
      });

      const response = await this.s3Client.send(command);
      const writeStream = fs.createWriteStream(localPath);

      return new Promise((resolve, reject) => {
        response.Body.pipe(writeStream)
          .on("error", (error) => {
            console.error("S3 download error:", error);
            reject(new Error(`S3 download failed: ${error.message}`));
          })
          .on("close", () => {
            console.log("S3 file downloaded successfully:", localPath);
            resolve({
              success: true,
              message: "File downloaded successfully",
              localPath: localPath,
            });
          });
      });
    } catch (error) {
      console.error("S3 download error:", error);
      throw new Error(`S3 download failed: ${error.message}`);
    }
  }

  async deleteItem(itemPath, isDirectory = false) {
    try {
      if (!this.isConnected || !this.s3Client) {
        throw new Error("Not connected to S3");
      }

      // Remove leading slash for S3
      const cleanPath = itemPath.startsWith("/")
        ? itemPath.substring(1)
        : itemPath;

      if (isDirectory) {
        // Delete all objects with this prefix
        const listCommand = new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: cleanPath.endsWith("/") ? cleanPath : cleanPath + "/",
        });

        const listResponse = await this.s3Client.send(listCommand);

        if (listResponse.Contents && listResponse.Contents.length > 0) {
          // Delete objects in batches
          for (const object of listResponse.Contents) {
            const deleteCommand = new DeleteObjectCommand({
              Bucket: this.bucket,
              Key: object.Key,
            });
            await this.s3Client.send(deleteCommand);
          }
        }
      } else {
        // Delete single file
        const command = new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: cleanPath,
        });
        await this.s3Client.send(command);
      }

      console.log("S3 item deleted successfully:", cleanPath);
      return {
        success: true,
        message: `${isDirectory ? "Directory" : "File"} deleted successfully`,
      };
    } catch (error) {
      console.error("S3 delete error:", error);
      throw new Error(`S3 delete failed: ${error.message}`);
    }
  }

  async createDirectory(dirPath) {
    try {
      if (!this.isConnected || !this.s3Client) {
        throw new Error("Not connected to S3");
      }

      // S3 doesn't have real directories, but we can create a placeholder object
      // Remove leading slash and ensure trailing slash
      let cleanPath = dirPath.startsWith("/") ? dirPath.substring(1) : dirPath;
      if (!cleanPath.endsWith("/")) {
        cleanPath += "/";
      }

      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: cleanPath,
        Body: "",
        ContentType: "application/x-directory",
      });

      await this.s3Client.send(command);

      console.log("S3 directory created successfully:", cleanPath);
      return { success: true, message: "Directory created successfully" };
    } catch (error) {
      console.error("S3 create directory error:", error);
      throw new Error(`S3 create directory failed: ${error.message}`);
    }
  }

  async previewFile(filePath) {
    try {
      if (!this.isConnected || !this.s3Client) {
        throw new Error("Not connected to S3");
      }

      // Remove leading slash
      const cleanPath = filePath.startsWith("/") ? filePath.substring(1) : filePath;
      const fileExtension = path.extname(cleanPath).toLowerCase();

      // First, get object info to check size
      const headCommand = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: cleanPath,
      });

      const headResult = await this.s3Client.send(headCommand);

      // Check file size (limit to 10MB for preview)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (headResult.ContentLength > maxSize) {
        throw new Error("File too large for preview (max 10MB)");
      }

      // Get the file content
      const getCommand = new GetObjectCommand({
        Bucket: this.bucket,
        Key: cleanPath,
      });

      const result = await this.s3Client.send(getCommand);

      // Convert stream to buffer
      const chunks = [];
      for await (const chunk of result.Body) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      
      let content;

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
          
          console.log("Starting to read Parquet rows...");
          try {
            while (count < 100 && (record = await cursor.next())) {
              rows.push(record);
              count++;
              if (count % 10 === 0) {
                console.log(`Read ${count} rows so far...`);
              }
            }
            console.log(`Finished reading ${rows.length} total rows`);
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
              fileName: path.basename(cleanPath),
              fileSize: headResult.ContentLength
            }
          }, null, 2);
          
        } catch (parquetError) {
          console.error("Parquet parsing error:", parquetError);
          
          // Fallback: try to provide basic file info without parsing
          content = JSON.stringify({
            error: "Unable to parse Parquet file",
            message: "This Parquet file format may not be supported for preview",
            fileName: path.basename(cleanPath),
            fileSize: headResult.ContentLength,
            suggestion: "Please download the file to view its contents with a specialized Parquet viewer",
            details: parquetError.message
          }, null, 2);
        }
      } else {
        // Handle text files (JSON, CSV, TXT, etc.)
        try {
          content = buffer.toString('utf-8');
        } catch (error) {
          throw new Error("File contains binary data and cannot be previewed");
        }
      }

      console.log("S3 file preview successful:", cleanPath);
      return {
        success: true,
        content: content,
        fileName: path.basename(cleanPath),
        fileSize: headResult.ContentLength,
        lastModified: headResult.LastModified,
      };
    } catch (error) {
      console.error("S3 preview error:", error);
      throw new Error(`S3 preview failed: ${error.message}`);
    }
  }

  /**
   * Get content type based on file extension
   * @param {string} fileName - File name
   * @returns {string} Content type
   */
  getContentType(fileName) {
    const ext = path.extname(fileName).toLowerCase();
    const contentTypes = {
      ".txt": "text/plain",
      ".html": "text/html",
      ".css": "text/css",
      ".js": "application/javascript",
      ".json": "application/json",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".pdf": "application/pdf",
      ".zip": "application/zip",
      ".xml": "application/xml",
    };
    return contentTypes[ext] || "application/octet-stream";
  }
}

module.exports = S3ConnectionManager;
