import { getAdapter } from '../cms/index.js';
import { SSHTransfer } from '../transfer/ssh.js';
import { runBackup } from './backup.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import type { SiteConfig, UploadOptions, FileInfo, CMSAdapter, EnvironmentType } from '../types/index.js';

const execAsync = promisify(exec);

interface FileCategories {
  Themes: FileInfo[];
  Plugins: FileInfo[];
  Uploads: FileInfo[];
  Core: FileInfo[];
  Other: FileInfo[];
}

/**
 * Upload files to a remote environment
 */
export async function runUpload(environment: string, options: UploadOptions, config: SiteConfig): Promise<void> {
  const envConfig = config.environments[environment as EnvironmentType];

  if (!envConfig) {
    console.error(`❌ Environment "${environment}" not found in configuration.`);
    console.error(`Available environments: ${Object.keys(config.environments).join(', ') || 'none'}`);
    process.exit(1);
  }

  console.log(`\n📤 Uploading to ${environment}...\n`);

  // Detect or use configured CMS
  const cmsName = config.cms || 'wordpress';
  const adapter = getAdapter(cmsName);

  // Check if we're in a valid CMS directory
  const isValidCMS = await adapter.detect();
  if (!isValidCMS) {
    console.error(`❌ No ${cmsName} installation found in current directory.`);
    process.exit(1);
  }

  // Get WordPress version for info
  const version = await adapter.getVersion();
  if (version) {
    console.log(`📦 WordPress version: ${version}`);
  }

  // Get files to upload
  console.log('🔍 Scanning files...');
  const files = await adapter.getFilesToUpload(options);

  if (files.length === 0) {
    console.log('ℹ️  No files to upload.');
    return;
  }

  console.log(`📁 Found ${files.length} files to upload`);

  // Show what will be uploaded
  if (options.dryRun) {
    console.log('\n🔍 Dry run - files that would be uploaded:');
    const categories = categorizeFiles(files);
    const limit = options.verbose ? Infinity : 5;

    for (const [category, categoryFiles] of Object.entries(categories) as [string, FileInfo[]][]) {
      if (categoryFiles.length > 0) {
        console.log(`\n  ${category}: ${categoryFiles.length} files`);
        categoryFiles.slice(0, limit).forEach((f: FileInfo) => {
          console.log(`    - ${f.relativePath}`);
        });
        if (categoryFiles.length > limit) {
          console.log(`    ... and ${categoryFiles.length - limit} more`);
        }
      }
    }
    return;
  }

  // Check if this is a local environment (no SSH config means local)
  if (environment === 'local' || !envConfig.ssh) {
    console.log('\n📁 Local environment - copying files locally...');
    // TODO: Implement local file copy
    console.log(`   Would copy ${files.length} files to ${envConfig.remotePath}`);
    return;
  }

  // Create backup before uploading (unless --no-backup is set)
  // Note: Commander.js converts --no-backup to options.backup (true by default, false when flag is used)
  if (options.backup !== false) {
    console.log('\n💾 Creating backup before upload...');
    // Create backup options matching what we're uploading
    const backupOptions: UploadOptions = {
      all: options.all,
      uploads: options.uploads,
      plugins: options.plugins,
      themes: options.themes,
      core: options.core,
    };
    await runBackup(environment, backupOptions, config);
    console.log(''); // Add spacing after backup
  } else {
    console.log('\n⚠️  Skipping backup (--no-backup flag set)');
  }

  // Connect and upload via SSH
  console.log(`\n🔌 Connecting to ${envConfig.ssh.host}...`);

  const transfer = new SSHTransfer(envConfig);

  try {
    await transfer.connect();
    console.log('✅ Connected!\n');

    // Create a temporary archive locally
    const tempDir = os.tmpdir();
    const archiveName = `move-site-upload-${Date.now()}.tar.gz`;
    const localArchivePath = path.join(tempDir, archiveName);
    const remoteArchivePath = `${envConfig.remotePath}/${archiveName}`;

    console.log('📦 Creating local archive...');
    
    // Determine what folders to include based on options
    let includePaths: string[] = [];
    
    if (options.all || (!options.uploads && !options.plugins && !options.themes && !options.core)) {
      // All files - exclude common dev folders
      includePaths = ['.'];
    } else {
      if (options.themes) includePaths.push('wp-content/themes');
      if (options.plugins) includePaths.push('wp-content/plugins');
      if (options.uploads) includePaths.push('wp-content/uploads');
      if (options.core) {
        includePaths.push('wp-admin', 'wp-includes');
        // Add root PHP files
        includePaths.push('*.php');
      }
    }

    // Build tar command with exclusions
    const excludes = [
      '--exclude=node_modules',
      '--exclude=vendor',
      '--exclude=.git',
      '--exclude=.svn',
      '--exclude=.DS_Store',
      '--exclude=Thumbs.db',
      '--exclude=.idea',
      '--exclude=.vscode',
      '--exclude=backups',
      '--exclude=.move-site-config.json',
      '--exclude=*.log',
      '--exclude=debug.log',
      '--exclude=error_log',
    ].join(' ');

    const tarCmd = `cd "${adapter.basePath}" && tar -czf "${localArchivePath}" ${excludes} ${includePaths.join(' ')}`;
    
    try {
      await execAsync(tarCmd);
    } catch (error) {
      const err = error as Error;
      console.error(`❌ Failed to create archive: ${err.message}`);
      process.exit(1);
    }

    // Get archive size
    const archiveStat = await fs.stat(localArchivePath);
    const sizeMB = (archiveStat.size / (1024 * 1024)).toFixed(2);
    console.log(`   ✅ Archive created: ${sizeMB} MB`);

    // Upload the archive
    console.log('\n📤 Uploading archive...');
    await transfer.uploadFile(localArchivePath, remoteArchivePath);
    console.log('   ✅ Archive uploaded');

    // Extract on server
    console.log('\n📂 Extracting on server...');
    const extractCmd = `cd "${envConfig.remotePath}" && tar -xzf "${archiveName}" && rm "${archiveName}"`;
    const extractResult = await transfer.exec(extractCmd);
    
    if (extractResult.code !== 0) {
      console.error(`❌ Failed to extract: ${extractResult.stderr}`);
      // Clean up remote archive if extraction failed
      await transfer.exec(`rm -f "${remoteArchivePath}"`);
    } else {
      console.log('   ✅ Files extracted');
    }

    // Clean up local archive
    await fs.unlink(localArchivePath);

    console.log(`\n✅ Upload complete! (${files.length} files)`);

    // If files owner is configured, check and update ownership if needed
    const filesOwner = envConfig.ssh?.filesOwner;
    const filesGroup = envConfig.ssh?.filesGroup || filesOwner;
    if (filesOwner) {
      // Check if any files have incorrect ownership (skip root folder with mindepth 1)
      const checkOwnerResult = await transfer.exec(
        `find "${envConfig.remotePath}" -mindepth 1 ! -user ${filesOwner} 2>/dev/null | head -1`
      );
      const hasWrongOwner = checkOwnerResult.stdout.trim().length > 0;

      if (!hasWrongOwner) {
        console.log(`\n✅ File ownership already correct: ${filesOwner}:${filesGroup}`);
      } else {
        console.log(`\n🔧 Setting file ownership to '${filesOwner}:${filesGroup}'...`);
        // Use find with -mindepth 1 to skip the root folder itself
        const chownResult = await transfer.exec(
          `find "${envConfig.remotePath}" -mindepth 1 -exec chown ${filesOwner}:${filesGroup} {} + 2>&1`
        );
        if (chownResult.code !== 0) {
          console.log(`   ⚠️  Could not change ownership (may require sudo): ${chownResult.stderr || chownResult.stdout}`);
        } else {
          console.log('   ✅ Ownership updated');
        }
      }
    }
  } catch (error) {
    const err = error as Error;
    console.error(`\n❌ Upload failed: ${err.message}`);
    process.exit(1);
  } finally {
    await transfer.disconnect();
  }
}

/**
 * Categorize files by type for display
 */
function categorizeFiles(files: FileInfo[]): FileCategories {
  const categories: FileCategories = {
    Themes: [],
    Plugins: [],
    Uploads: [],
    Core: [],
    Other: [],
  };

  for (const file of files) {
    if (file.relativePath.startsWith('wp-content/themes')) {
      categories.Themes.push(file);
    } else if (file.relativePath.startsWith('wp-content/plugins')) {
      categories.Plugins.push(file);
    } else if (file.relativePath.startsWith('wp-content/uploads')) {
      categories.Uploads.push(file);
    } else if (file.relativePath.startsWith('wp-admin') || file.relativePath.startsWith('wp-includes')) {
      categories.Core.push(file);
    } else {
      categories.Other.push(file);
    }
  }

  return categories;
}
