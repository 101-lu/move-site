import fs from 'fs/promises';
import path from 'path';
import type {
  CMSAdapter,
  FileInfo,
  UploadOptions,
  WordPressFolders,
  WordPressDBConfig,
  DatabaseConfig,
} from '../types/index.js';

/**
 * WordPress CMS Adapter
 * Handles WordPress-specific file detection and organization
 */
export class WordPressAdapter implements CMSAdapter {
  public readonly name = 'wordpress';
  public readonly basePath: string;

  /** WordPress folder structure */
  public readonly folders: WordPressFolders = {
    uploads: 'wp-content/uploads',
    plugins: 'wp-content/plugins',
    themes: 'wp-content/themes',
    muPlugins: 'wp-content/mu-plugins',
    languages: 'wp-content/languages',
    wpContent: 'wp-content',
    wpAdmin: 'wp-admin',
    wpIncludes: 'wp-includes',
  };

  /** Core files that identify WordPress */
  public readonly coreFiles: string[] = ['wp-config.php', 'wp-load.php', 'wp-settings.php', 'wp-login.php'];

  constructor(basePath: string = process.cwd()) {
    this.basePath = basePath;
  }

  /**
   * Detect if current directory is a WordPress installation
   */
  async detect(): Promise<boolean> {
    try {
      const hasWpConfig = (await this.fileExists('wp-config.php')) || (await this.fileExists('wp-config-sample.php'));
      const hasWpContent = await this.directoryExists('wp-content');
      return hasWpConfig && hasWpContent;
    } catch {
      return false;
    }
  }

  /**
   * Check if a file exists
   */
  async fileExists(relativePath: string): Promise<boolean> {
    try {
      const fullPath = path.join(this.basePath, relativePath);
      const stat = await fs.stat(fullPath);
      return stat.isFile();
    } catch {
      return false;
    }
  }

  /**
   * Check if a directory exists
   */
  async directoryExists(relativePath: string): Promise<boolean> {
    try {
      const fullPath = path.join(this.basePath, relativePath);
      const stat = await fs.stat(fullPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Get the path for a specific folder type
   */
  getFolderPath(folderType: keyof WordPressFolders): string {
    const relativePath = this.folders[folderType];
    if (!relativePath) {
      throw new Error(`Unknown folder type: ${folderType}`);
    }
    return path.join(this.basePath, relativePath);
  }

  /**
   * Get all files to upload based on options
   */
  async getFilesToUpload(options: UploadOptions = {}): Promise<FileInfo[]> {
    const files: FileInfo[] = [];

    // If no specific options, upload everything
    const uploadAll = options.all || (!options.uploads && !options.plugins && !options.themes && !options.core);

    if (uploadAll) {
      const allFiles = await this.getAllFiles(this.basePath);
      return allFiles;
    }

    // Specific folder uploads
    if (options.uploads) {
      const uploadsPath = this.folders.uploads;
      if (await this.directoryExists(uploadsPath)) {
        const uploadsFiles = await this.getAllFiles(path.join(this.basePath, uploadsPath));
        files.push(
          ...uploadsFiles.map((f) => ({
            ...f,
            relativePath: path.join(uploadsPath, f.relativePath),
          }))
        );
      }
    }

    if (options.plugins) {
      const pluginsPath = this.folders.plugins;
      if (await this.directoryExists(pluginsPath)) {
        const pluginsFiles = await this.getAllFiles(path.join(this.basePath, pluginsPath));
        files.push(
          ...pluginsFiles.map((f) => ({
            ...f,
            relativePath: path.join(pluginsPath, f.relativePath),
          }))
        );
      }
    }

    if (options.themes) {
      const themesPath = this.folders.themes;
      if (await this.directoryExists(themesPath)) {
        const themesFiles = await this.getAllFiles(path.join(this.basePath, themesPath));
        files.push(
          ...themesFiles.map((f) => ({
            ...f,
            relativePath: path.join(themesPath, f.relativePath),
          }))
        );
      }
    }

    if (options.core) {
      const coreItems = await fs.readdir(this.basePath);
      for (const item of coreItems) {
        if (item === 'wp-content' || item === 'wp-config.php') continue;

        const itemPath = path.join(this.basePath, item);
        const stat = await fs.stat(itemPath);

        if (stat.isFile() && item.endsWith('.php')) {
          files.push({
            absolutePath: itemPath,
            relativePath: item,
            size: stat.size,
          });
        } else if (stat.isDirectory() && (item === 'wp-admin' || item === 'wp-includes')) {
          const dirFiles = await this.getAllFiles(itemPath);
          files.push(
            ...dirFiles.map((f) => ({
              ...f,
              relativePath: path.join(item, f.relativePath),
            }))
          );
        }
      }
    }

    return files;
  }

  /**
   * Recursively get all files in a directory
   */
  async getAllFiles(dirPath: string, relativeTo?: string): Promise<FileInfo[]> {
    const baseDir = relativeTo || dirPath;
    const files: FileInfo[] = [];

    const items = await fs.readdir(dirPath, { withFileTypes: true });

    for (const item of items) {
      const fullPath = path.join(dirPath, item.name);
      const relativePath = path.relative(baseDir, fullPath);

      if (this.shouldExclude(item.name)) {
        continue;
      }

      if (item.isDirectory()) {
        const subFiles = await this.getAllFiles(fullPath, baseDir);
        files.push(...subFiles);
      } else {
        const stat = await fs.stat(fullPath);
        files.push({
          absolutePath: fullPath,
          relativePath: relativePath,
          size: stat.size,
        });
      }
    }

    return files;
  }

  /**
   * Check if a file/folder should be excluded
   */
  shouldExclude(name: string): boolean {
    const excludePatterns = [
      // Version control
      '.git',
      '.gitignore',
      '.gitattributes',
      '.svn',
      // Dependencies
      'node_modules',
      'vendor',
      // Build/dev files
      '.env',
      '.env.local',
      '.env.production',
      // OS files
      '.DS_Store',
      'Thumbs.db',
      'desktop.ini',
      // IDE/Editor
      '.idea',
      '.vscode',
      '*.swp',
      '*.swo',
      // App specific
      '.move-site-config.json',
      'backups',
      // Logs
      '*.log',
      'debug.log',
      'error_log',
    ];

    return excludePatterns.some((pattern) => {
      if (pattern.startsWith('*')) {
        return name.endsWith(pattern.slice(1));
      }
      return name === pattern;
    });
  }

  /**
   * Parse wp-config.php to get database credentials
   */
  async getDatabaseConfig(): Promise<DatabaseConfig | null> {
    try {
      const wpConfigPath = path.join(this.basePath, 'wp-config.php');
      const content = await fs.readFile(wpConfigPath, 'utf-8');

      const extractValue = (constant: string): string | null => {
        const regex = new RegExp(`define\\s*\\(\\s*['"]${constant}['"]\\s*,\\s*['"]([^'"]+)['"]`);
        const match = content.match(regex);
        return match ? match[1] : null;
      };

      const name = extractValue('DB_NAME');
      const user = extractValue('DB_USER');
      const password = extractValue('DB_PASSWORD');
      const host = extractValue('DB_HOST') || 'localhost';

      if (!name || !user || password === null) {
        return null;
      }

      return {
        name,
        user,
        password,
        host,
      };
    } catch {
      return null;
    }
  }

  /**
   * Extract table prefix from wp-config.php
   */
  extractTablePrefix(content: string): string {
    const regex = /\$table_prefix\s*=\s*['"]([^'"]+)['"]/;
    const match = content.match(regex);
    return match ? match[1] : 'wp_';
  }

  /**
   * Get WordPress version
   */
  async getVersion(): Promise<string | null> {
    try {
      const versionPath = path.join(this.basePath, 'wp-includes/version.php');
      const content = await fs.readFile(versionPath, 'utf-8');

      const regex = /\$wp_version\s*=\s*['"]([^'"]+)['"]/;
      const match = content.match(regex);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }
}
