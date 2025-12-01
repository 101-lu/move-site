import { getAdapter } from '../cms/index.js';
import { SSHTransfer } from '../transfer/ssh.js';
import { runBackup } from './backup.js';
import type { SiteConfig, UploadOptions, FileInfo, CMSAdapter, EnvironmentType } from '../types/index.js';

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

    for (const [category, categoryFiles] of Object.entries(categories) as [string, FileInfo[]][]) {
      if (categoryFiles.length > 0) {
        console.log(`\n  ${category}: ${categoryFiles.length} files`);
        categoryFiles.slice(0, 5).forEach((f: FileInfo) => {
          console.log(`    - ${f.relativePath}`);
        });
        if (categoryFiles.length > 5) {
          console.log(`    ... and ${categoryFiles.length - 5} more`);
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

    // Upload files with progress
    const result = await transfer.uploadFiles(files, envConfig.remotePath, (progress) => {
      if (progress.type === 'start') {
        process.stdout.write(
          `\r⏳ Uploading (${progress.completed + 1}/${progress.total}): ${progress.file.slice(0, 50)}...`
        );
      }
    });

    // Clear the progress line
    process.stdout.write('\r' + ' '.repeat(80) + '\r');

    console.log(`\n✅ Upload complete!`);
    console.log(`   ${result.completed}/${result.total} files uploaded successfully`);

    if (result.errors.length > 0) {
      console.log(`\n⚠️  ${result.errors.length} files failed to upload:`);
      result.errors.forEach((err) => {
        console.log(`   - ${err.file}: ${err.error}`);
      });
    }

    // If files owner is configured, check and update ownership if needed
    const filesOwner = envConfig.ssh?.filesOwner;
    const filesGroup = envConfig.ssh?.filesGroup || filesOwner;
    if (filesOwner) {
      // Check if any files have incorrect ownership
      const checkOwnerResult = await transfer.exec(
        `find "${envConfig.remotePath}" ! -user ${filesOwner} 2>/dev/null | head -1`
      );
      const hasWrongOwner = checkOwnerResult.stdout.trim().length > 0;

      if (!hasWrongOwner) {
        console.log(`\n✅ File ownership already correct: ${filesOwner}:${filesGroup}`);
      } else {
        console.log(`\n🔧 Setting file ownership to '${filesOwner}:${filesGroup}'...`);
        const chownResult = await transfer.exec(
          `chown -R ${filesOwner}:${filesGroup} "${envConfig.remotePath}" 2>&1`
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
