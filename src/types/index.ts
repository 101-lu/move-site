/**
 * Site Move - Type Definitions
 *
 * This file contains all the TypeScript interfaces and types
 * used throughout the application.
 */

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * SSH connection configuration
 */
export interface SSHConfig {
  host: string;
  port: number;
  user: string;
  password?: string;
  keyPath?: string;
  /** Owner username for uploaded files (for chown). If not set, files keep the SSH user ownership */
  filesOwner?: string;
  /** Owner group for uploaded files (for chown). If not set, uses filesOwner value */
  filesGroup?: string;
}

/**
 * Database connection configuration
 */
export interface DatabaseConfig {
  host: string;
  port?: number;
  name: string;
  user: string;
  password: string;
  /** Table prefix for CMS (e.g., 'wp_' for WordPress) */
  tablePrefix?: string;
}

/**
 * Environment type classification
 */
export type EnvironmentType = 'production' | 'test' | 'development' | 'local';

/**
 * Single environment configuration
 * Note: ssh is optional for local environments
 */
export interface EnvironmentConfig {
  ssh?: SSHConfig;
  remotePath: string;
  database: DatabaseConfig;
}

/**
 * Global configuration options
 */
export interface ConfigOptions {
  excludePatterns: string[];
}

/**
 * Supported CMS types
 */
export type CMSType = 'wordpress' | 'drupal' | 'custom';

/**
 * Main application configuration structure
 */
export interface SiteConfig {
  version: string;
  name: string;
  cms: CMSType;
  environments: Partial<Record<EnvironmentType, EnvironmentConfig>>;
  options: ConfigOptions;
}

// =============================================================================
// File Transfer Types
// =============================================================================

/**
 * Represents a file to be transferred
 */
export interface FileInfo {
  absolutePath: string;
  relativePath: string;
  size: number;
}

/**
 * Upload options from CLI flags
 */
export interface UploadOptions {
  all?: boolean;
  uploads?: boolean;
  plugins?: boolean;
  themes?: boolean;
  core?: boolean;
  database?: boolean;
  dryRun?: boolean;
  backup?: boolean;  // Commander.js converts --no-backup to backup: false
}

/**
 * Progress event during file transfer
 */
export interface TransferProgress {
  type: 'start' | 'complete' | 'error';
  file: string;
  completed: number;
  total: number;
  error?: string;
}

/**
 * Result of a file transfer operation
 */
export interface TransferResult {
  completed: number;
  total: number;
  errors: Array<{
    file: string;
    error: string;
  }>;
}

/**
 * Progress callback function type
 */
export type ProgressCallback = (progress: TransferProgress) => void;

// =============================================================================
// CMS Adapter Types
// =============================================================================

/**
 * WordPress folder structure mapping
 */
export interface WordPressFolders {
  uploads: string;
  plugins: string;
  themes: string;
  muPlugins: string;
  languages: string;
  wpContent: string;
  wpAdmin: string;
  wpIncludes: string;
}

/**
 * WordPress database configuration extracted from wp-config.php
 */
export interface WordPressDBConfig {
  name: string | null;
  user: string | null;
  password: string | null;
  host: string;
  prefix: string;
}

/**
 * Base interface for all CMS adapters
 * This should be implemented by each CMS-specific adapter
 */
export interface CMSAdapter {
  /** The name/identifier of the CMS */
  name: string;

  /** Base path of the CMS installation */
  basePath: string;

  /**
   * Detect if the current directory contains this CMS
   */
  detect(): Promise<boolean>;

  /**
   * Get files to upload based on options
   */
  getFilesToUpload(options: UploadOptions): Promise<FileInfo[]>;

  /**
   * Get the CMS version if detectable
   */
  getVersion(): Promise<string | null>;

  /**
   * Get database configuration from CMS config files
   */
  getDatabaseConfig(): Promise<DatabaseConfig | null>;
}

// =============================================================================
// UI Component Types
// =============================================================================

/**
 * Props for the ConfigWizard component
 */
export interface ConfigWizardProps {
  existingConfig?: SiteConfig | null;
  onComplete: (config: SiteConfig) => void | Promise<void>;
  onCancel: () => void;
}

/**
 * Props for the UploadProgress component
 */
export interface UploadProgressProps {
  files: FileInfo[];
  currentFile: string;
  progress: {
    completed: number;
    total: number;
  };
  status: 'uploading' | 'complete' | 'error';
}

/**
 * Props for the StatusMessage component
 */
export interface StatusMessageProps {
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

/**
 * Props for the FileList component
 */
export interface FileListProps {
  files: string[];
  title: string;
}

/**
 * Select input item structure
 */
export interface SelectItem<T = string> {
  label: string;
  value: T;
}

// =============================================================================
// Internal State Types
// =============================================================================

/**
 * Current environment being configured in the wizard
 */
export interface WizardEnvironmentState {
  name: string;
  type: EnvironmentType;
  ssh: {
    host: string;
    port: string;
    user: string;
    authType: 'key' | 'password';
    password: string;
    keyPath: string;
    filesOwner: string;
    filesGroup: string;
  };
  remotePath: string;
  database: {
    host: string;
    name: string;
    user: string;
    password: string;
    tablePrefix: string;
  };
}

/**
 * Wizard step identifiers
 */
export type WizardStep =
  | 'cms_select'
  | 'site_name'
  | 'env_type'
  | 'ssh_host'
  | 'ssh_port'
  | 'ssh_user'
  | 'ssh_auth_type'
  | 'ssh_password'
  | 'ssh_key_path'
  | 'ssh_files_owner'
  | 'ssh_files_group'
  | 'remote_path'
  | 'local_path'
  | 'db_host'
  | 'db_name'
  | 'db_user'
  | 'db_password'
  | 'db_table_prefix'
  | 'add_another'
  | 'confirm';
