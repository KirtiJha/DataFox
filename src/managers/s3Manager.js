const {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
} = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
const fs = require("fs");
const path = require("path");
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

      // Get the main directory listing (all pages)
      const response = { CommonPrefixes: [], Contents: [] };
      let continuationToken;
      do {
        const page = await this.s3Client.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: cleanPrefix,
            Delimiter: "/",
            ContinuationToken: continuationToken,
          })
        );
        response.CommonPrefixes.push(...(page.CommonPrefixes || []));
        response.Contents.push(...(page.Contents || []));
        continuationToken = page.IsTruncated
          ? page.NextContinuationToken
          : undefined;
      } while (continuationToken);

      console.log("S3 listDirectory response:", {
        CommonPrefixes: response.CommonPrefixes.length,
        Contents: response.Contents.length,
        Prefix: cleanPrefix,
      });

      const files = [];

      // Get folder counts efficiently in a single call
      const folderCounts = await this.getFolderCounts(cleanPrefix, response.CommonPrefixes);

      // Add directories (common prefixes) with file counts
      if (response.CommonPrefixes) {
        for (const commonPrefix of response.CommonPrefixes) {
          const folderName = commonPrefix.Prefix.slice(cleanPrefix.length).replace(/\/$/, "");
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
                modifiedAt: null,
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

          const fileName = object.Key.slice(cleanPrefix.length);
          if (fileName && !fileName.includes("/")) {
            console.log(`Found file: ${fileName}`);
            files.push(
              this.formatFileInfo({
                name: fileName,
                size: object.Size || 0,
                type: "file",
                isDirectory: false,
                modifiedAt: object.LastModified || null,
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
        const keys = await this.listAllKeys(
          cleanPath.endsWith("/") ? cleanPath : cleanPath + "/"
        );
        for (const key of keys) {
          await this.s3Client.send(
            new DeleteObjectCommand({ Bucket: this.bucket, Key: key })
          );
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

  toKey(remotePath) {
    return remotePath.startsWith("/") ? remotePath.substring(1) : remotePath;
  }

  async listAllKeys(prefix) {
    const keys = [];
    let continuationToken;
    do {
      const page = await this.s3Client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        })
      );
      keys.push(...(page.Contents || []).map((object) => object.Key));
      continuationToken = page.IsTruncated
        ? page.NextContinuationToken
        : undefined;
    } while (continuationToken);
    return keys;
  }

  async getFileSize(remotePath) {
    if (!this.isConnected || !this.s3Client) {
      throw new Error("Not connected to S3");
    }
    const head = await this.s3Client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: this.toKey(remotePath) })
    );
    return head.ContentLength || 0;
  }

  async readFile(remotePath) {
    if (!this.isConnected || !this.s3Client) {
      throw new Error("Not connected to S3");
    }
    const result = await this.s3Client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: this.toKey(remotePath) })
    );
    const chunks = [];
    for await (const chunk of result.Body) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async previewFile(filePath) {
    try {
      return await super.previewFile(filePath);
    } catch (error) {
      console.error("S3 preview error:", error);
      throw new Error(`S3 preview failed: ${error.message}`);
    }
  }

  async copyObject(sourceKey, destinationKey) {
    // CopySource must be URL-encoded, but "/" separators are kept.
    const copySource = `${this.bucket}/${sourceKey}`
      .split("/")
      .map(encodeURIComponent)
      .join("/");
    await this.s3Client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: copySource,
        Key: destinationKey,
      })
    );
  }

  /**
   * S3 has no rename: copy every affected object to the new key, then delete the old one.
   */
  async rename(oldPath, newPath) {
    try {
      if (!this.isConnected || !this.s3Client) {
        throw new Error("Not connected to S3");
      }

      const oldKey = this.toKey(oldPath).replace(/\/$/, "");
      const newKey = this.toKey(newPath).replace(/\/$/, "");

      const folderKeys = await this.listAllKeys(`${oldKey}/`);
      const moves =
        folderKeys.length > 0
          ? folderKeys.map((key) => [key, newKey + key.slice(oldKey.length)])
          : [[oldKey, newKey]];

      for (const [from, to] of moves) {
        await this.copyObject(from, to);
      }
      for (const [from] of moves) {
        await this.s3Client.send(
          new DeleteObjectCommand({ Bucket: this.bucket, Key: from })
        );
      }

      console.log(`S3 renamed ${oldKey} -> ${newKey} (${moves.length} objects)`);
      return { success: true, message: "Renamed successfully" };
    } catch (error) {
      console.error("S3 rename error:", error);
      throw new Error(`S3 rename failed: ${error.message}`);
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
