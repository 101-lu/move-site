import Client from 'ssh2-sftp-client';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

/**
 * SSH/SFTP Transfer handler
 */
export class SSHTransfer {
  constructor(config) {
    this.config = config;
    this.client = new Client();
    this.connected = false;
  }

  /**
   * Resolve home directory in paths
   */
  resolvePath(filePath) {
    if (filePath.startsWith('~')) {
      return path.join(os.homedir(), filePath.slice(1));
    }
    return filePath;
  }

  /**
   * Connect to the remote server
   */
  async connect() {
    const sshConfig = {
      host: this.config.ssh.host,
      port: this.config.ssh.port || 22,
      username: this.config.ssh.user
    };

    // Authentication
    if (this.config.ssh.password) {
      sshConfig.password = this.config.ssh.password;
    } else if (this.config.ssh.keyPath) {
      const keyPath = this.resolvePath(this.config.ssh.keyPath);
      try {
        sshConfig.privateKey = await fs.readFile(keyPath, 'utf-8');
      } catch (error) {
        throw new Error(`Failed to read SSH key from ${keyPath}: ${error.message}`);
      }
    }

    try {
      await this.client.connect(sshConfig);
      this.connected = true;
    } catch (error) {
      throw new Error(`SSH connection failed: ${error.message}`);
    }
  }

  /**
   * Disconnect from the server
   */
  async disconnect() {
    if (this.connected) {
      await this.client.end();
      this.connected = false;
    }
  }

  /**
   * Ensure remote directory exists
   */
  async ensureRemoteDir(remotePath) {
    try {
      await this.client.mkdir(remotePath, true);
    } catch (error) {
      // Directory might already exist
      if (!error.message.includes('already exists')) {
        throw error;
      }
    }
  }

  /**
   * Upload a single file
   */
  async uploadFile(localPath, remotePath) {
    const remoteDir = path.dirname(remotePath);
    await this.ensureRemoteDir(remoteDir);
    await this.client.put(localPath, remotePath);
  }

  /**
   * Upload multiple files with progress callback
   */
  async uploadFiles(files, remotePath, onProgress) {
    let completed = 0;
    const total = files.length;
    const errors = [];

    for (const file of files) {
      const remoteFilePath = path.join(remotePath, file.relativePath);
      
      try {
        if (onProgress) {
          onProgress({
            type: 'start',
            file: file.relativePath,
            completed,
            total
          });
        }

        await this.uploadFile(file.absolutePath, remoteFilePath);
        completed++;

        if (onProgress) {
          onProgress({
            type: 'complete',
            file: file.relativePath,
            completed,
            total
          });
        }
      } catch (error) {
        errors.push({
          file: file.relativePath,
          error: error.message
        });

        if (onProgress) {
          onProgress({
            type: 'error',
            file: file.relativePath,
            error: error.message,
            completed,
            total
          });
        }
      }
    }

    return {
      completed,
      total,
      errors
    };
  }

  /**
   * Download a single file
   */
  async downloadFile(remotePath, localPath) {
    const localDir = path.dirname(localPath);
    await fs.mkdir(localDir, { recursive: true });
    await this.client.get(remotePath, localPath);
  }

  /**
   * List remote directory contents
   */
  async listRemote(remotePath) {
    return await this.client.list(remotePath);
  }

  /**
   * Check if remote path exists
   */
  async exists(remotePath) {
    return await this.client.exists(remotePath);
  }

  /**
   * Execute a command on the remote server
   */
  async exec(command) {
    // Note: ssh2-sftp-client doesn't support exec directly
    // For database operations, we'll need to use the base ssh2 client
    throw new Error('Remote command execution not yet implemented');
  }
}
