import { getAdapter } from '../cms/index.js';
import { SSHTransfer } from '../transfer/ssh.js';
import type { SiteConfig, UploadOptions, FileInfo, CMSAdapter } from '../types/index.js';

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
  const envConfig = config.environments[environment];

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

  // Check if this is a local environment
  if (envConfig.type === 'local' || !envConfig.ssh) {
    console.log('\n📁 Local environment - copying files locally...');
    // TODO: Implement local file copy
    console.log(`   Would copy ${files.length} files to ${envConfig.remotePath}`);
    return;
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
