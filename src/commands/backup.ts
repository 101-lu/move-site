import { SSHTransfer } from '../transfer/ssh.js';
import type { SiteConfig, UploadOptions, EnvironmentType } from '../types/index.js';

/**
 * WordPress folder paths for backup
 */
const WP_FOLDERS: Record<string, string> = {
  themes: 'wp-content/themes',
  plugins: 'wp-content/plugins',
  uploads: 'wp-content/uploads',
  core: '.', // Root level files
};

/**
 * Generate backup filename with timestamp
 */
function generateBackupName(type: string): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const time = now.toISOString().slice(11, 16).replace(':', '-'); // HH-mm
  return `${date}-${time}-${type}.tar.gz`;
}

/**
 * Get folders to backup based on options
 */
function getFoldersToBackup(options: UploadOptions): { name: string; path: string }[] {
  const folders: { name: string; path: string }[] = [];

  if (options.all) {
    return [{ name: 'all', path: '.' }];
  }

  if (options.themes) {
    folders.push({ name: 'themes', path: WP_FOLDERS.themes });
  }
  if (options.plugins) {
    folders.push({ name: 'plugins', path: WP_FOLDERS.plugins });
  }
  if (options.uploads) {
    folders.push({ name: 'uploads', path: WP_FOLDERS.uploads });
  }
  if (options.core) {
    folders.push({ name: 'core', path: WP_FOLDERS.core });
  }

  // If no specific options, backup everything
  if (folders.length === 0) {
    return [{ name: 'all', path: '.' }];
  }

  return folders;
}

/**
 * Create a backup of files on the remote environment
 */
export async function runBackup(environment: string, options: UploadOptions, config: SiteConfig): Promise<void> {
  const envConfig = config.environments[environment as EnvironmentType];

  if (!envConfig) {
    console.error(`❌ Environment "${environment}" not found in configuration.`);
    console.error(`Available environments: ${Object.keys(config.environments).join(', ') || 'none'}`);
    process.exit(1);
  }

  // Check if this is a local environment
  if (environment === 'local' || !envConfig.ssh) {
    console.error('❌ Backup command is only available for remote environments.');
    console.error('   For local environments, use your system\'s backup tools.');
    process.exit(1);
  }

  console.log(`\n📦 Creating backup on ${environment}...\n`);

  const foldersToBackup = getFoldersToBackup(options);
  const remotePath = envConfig.remotePath;
  const backupsDir = `${remotePath}/backups`;

  // Show what will be backed up
  if (options.dryRun) {
    console.log('🔍 Dry run - would create backups for:');
    for (const folder of foldersToBackup) {
      const backupName = generateBackupName(folder.name);
      console.log(`   📁 ${folder.path} → backups/${backupName}`);
    }
    return;
  }

  // Connect to remote server
  console.log(`🔌 Connecting to ${envConfig.ssh.host}...`);
  const transfer = new SSHTransfer(envConfig);

  try {
    await transfer.connect();
    console.log('✅ Connected!\n');

    // Create backups directory if it doesn't exist
    console.log('📁 Ensuring backups directory exists...');
    const mkdirResult = await transfer.exec(`mkdir -p "${backupsDir}"`);
    if (mkdirResult.code !== 0) {
      throw new Error(`Failed to create backups directory: ${mkdirResult.stderr}`);
    }

    // Create backup for each folder
    for (const folder of foldersToBackup) {
      const backupName = generateBackupName(folder.name);
      const backupPath = `${backupsDir}/${backupName}`;
      const sourcePath = folder.path === '.' ? remotePath : `${remotePath}/${folder.path}`;

      console.log(`\n⏳ Backing up ${folder.name}...`);

      // Check if source exists
      const exists = await transfer.exists(sourcePath);
      if (!exists) {
        console.log(`   ⚠️  Skipping ${folder.name} - path does not exist: ${sourcePath}`);
        continue;
      }

      // Build tar command
      // For 'all', exclude the backups folder to prevent recursive backup
      let tarCommand: string;
      if (folder.path === '.') {
        tarCommand = `cd "${remotePath}" && tar -czf "${backupPath}" --exclude='./backups' .`;
      } else {
        tarCommand = `cd "${remotePath}" && tar -czf "${backupPath}" "${folder.path}"`;
      }

      const result = await transfer.exec(tarCommand);

      if (result.code !== 0) {
        console.error(`   ❌ Failed to backup ${folder.name}: ${result.stderr}`);
      } else {
        // Get backup file size
        const sizeResult = await transfer.exec(`du -h "${backupPath}" | cut -f1`);
        const size = sizeResult.stdout.trim() || 'unknown size';
        console.log(`   ✅ Created: backups/${backupName} (${size})`);
      }
    }

    console.log('\n✅ Backup complete!');
  } catch (error) {
    const err = error as Error;
    console.error(`\n❌ Backup failed: ${err.message}`);
    process.exit(1);
  } finally {
    await transfer.disconnect();
  }
}

/**
 * List existing backups on the remote environment
 */
export async function listBackups(environment: string, config: SiteConfig): Promise<void> {
  const envConfig = config.environments[environment as EnvironmentType];

  if (!envConfig) {
    console.error(`❌ Environment "${environment}" not found in configuration.`);
    process.exit(1);
  }

  if (!envConfig.ssh) {
    console.error('❌ List backups is only available for remote environments.');
    process.exit(1);
  }

  console.log(`\n📋 Listing backups on ${environment}...\n`);

  const transfer = new SSHTransfer(envConfig);

  try {
    await transfer.connect();

    const backupsDir = `${envConfig.remotePath}/backups`;
    const result = await transfer.exec(`ls -lh "${backupsDir}" 2>/dev/null | grep -E '\\.tar\\.gz$' | awk '{print $9, $5}'`);

    if (result.code !== 0 || !result.stdout.trim()) {
      console.log('   No backups found.');
      return;
    }

    const lines = result.stdout.trim().split('\n');
    console.log(`   Found ${lines.length} backup(s):\n`);
    
    for (const line of lines) {
      const [name, size] = line.split(' ');
      console.log(`   📦 ${name} (${size})`);
    }
  } catch (error) {
    const err = error as Error;
    console.error(`\n❌ Failed to list backups: ${err.message}`);
    process.exit(1);
  } finally {
    await transfer.disconnect();
  }
}
