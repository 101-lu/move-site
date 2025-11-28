import Client from 'ssh2-sftp-client';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import type {
  EnvironmentConfig,
  FileInfo,
  TransferProgress,
  TransferResult,
  ProgressCallback,
} from '../types/index.js';

/**
 * SSH/SFTP Transfer handler
 */
export class SSHTransfer {
  private config: EnvironmentConfig;
  private client: Client;
  private connected: boolean = false;

  constructor(config: EnvironmentConfig) {
    if (!config.ssh) {
      throw new Error('SSH configuration is required for remote transfers');
    }
    this.config = config;
    this.client = new Client();
  }

  /**
   * Resolve home directory in paths
   */
  private resolvePath(filePath: string): string {
    if (filePath.startsWith('~')) {
      return path.join(os.homedir(), filePath.slice(1));
    }
    return filePath;
  }

  /**
   * Connect to the remote server
   */
  async connect(): Promise<void> {
    const ssh = this.config.ssh!; // Validated in constructor
    const sshConfig: Client.ConnectOptions = {
      host: ssh.host,
      port: ssh.port || 22,
      username: ssh.user,
    };

    // Authentication
    if (ssh.password) {
      sshConfig.password = ssh.password;
    } else if (ssh.keyPath) {
      const keyPath = this.resolvePath(ssh.keyPath);
      try {
        sshConfig.privateKey = await fs.readFile(keyPath, 'utf-8');
      } catch (error) {
        const err = error as Error;
        throw new Error(`Failed to read SSH key from ${keyPath}: ${err.message}`);
      }
    }

    try {
      await this.client.connect(sshConfig);
      this.connected = true;
    } catch (error) {
      const err = error as Error;
      throw new Error(`SSH connection failed: ${err.message}`);
    }
  }

  /**
   * Disconnect from the server
   */
  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.client.end();
      this.connected = false;
    }
  }

  /**
   * Ensure remote directory exists
   */
  async ensureRemoteDir(remotePath: string): Promise<void> {
    try {
      await this.client.mkdir(remotePath, true);
    } catch (error) {
      const err = error as Error;
      // Directory might already exist
      if (!err.message.includes('already exists')) {
        throw error;
      }
    }
  }

  /**
   * Upload a single file
   */
  async uploadFile(localPath: string, remotePath: string): Promise<void> {
    const remoteDir = path.dirname(remotePath);
    await this.ensureRemoteDir(remoteDir);
    await this.client.put(localPath, remotePath);
  }

  /**
   * Upload multiple files with progress callback
   */
  async uploadFiles(files: FileInfo[], remotePath: string, onProgress?: ProgressCallback): Promise<TransferResult> {
    let completed = 0;
    const total = files.length;
    const errors: Array<{ file: string; error: string }> = [];

    for (const file of files) {
      const remoteFilePath = path.join(remotePath, file.relativePath);

      try {
        if (onProgress) {
          onProgress({
            type: 'start',
            file: file.relativePath,
            completed,
            total,
          });
        }

        await this.uploadFile(file.absolutePath, remoteFilePath);
        completed++;

        if (onProgress) {
          onProgress({
            type: 'complete',
            file: file.relativePath,
            completed,
            total,
          });
        }
      } catch (error) {
        const err = error as Error;
        errors.push({
          file: file.relativePath,
          error: err.message,
        });

        if (onProgress) {
          onProgress({
            type: 'error',
            file: file.relativePath,
            error: err.message,
            completed,
            total,
          });
        }
      }
    }

    return {
      completed,
      total,
      errors,
    };
  }

  /**
   * Download a single file
   */
  async downloadFile(remotePath: string, localPath: string): Promise<void> {
    const localDir = path.dirname(localPath);
    await fs.mkdir(localDir, { recursive: true });
    await this.client.get(remotePath, localPath);
  }

  /**
   * List remote directory contents
   */
  async listRemote(remotePath: string): Promise<Client.FileInfo[]> {
    return await this.client.list(remotePath);
  }

  /**
   * Check if remote path exists
   */
  async exists(remotePath: string): Promise<string | boolean> {
    return await this.client.exists(remotePath);
  }
}
