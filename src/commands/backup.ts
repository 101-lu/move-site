import React from 'react';
import { render } from 'ink';
import fs from 'fs/promises';
import path from 'path';
import { SSHTransfer } from '../transfer/ssh.js';
import { BackupSelector, BackupFile } from '../ui/BackupSelector.js';
import { resolveEnvironmentOrExit } from '../config/resolver.js';
import type { SiteConfig, UploadOptions } from '../types/index.js';

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

  // If only database is requested, return empty (handled separately)
  if (options.database && !options.all && !options.themes && !options.plugins && !options.uploads && !options.core) {
    return [];
  }

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

  // If no specific options (and not database-only), backup everything
  if (folders.length === 0 && !options.database) {
    return [{ name: 'all', path: '.' }];
  }

  return folders;
}

/**
 * Create a backup of files on the remote environment
 */
export async function runBackup(environmentId: string, options: UploadOptions, config: SiteConfig): Promise<void> {
  // Resolve environment (supports exact domain, type, or fuzzy match)
  const environment = await resolveEnvironmentOrExit(environmentId, config);
  const envConfig = config.environments[environment];

  // Check if this is a local environment
  if (!envConfig.ssh) {
    console.error('❌ Backup command is only available for remote environments.');
    console.error('   For local environments, use your system\'s backup tools.');
    process.exit(1);
  }

  console.log(`\n📦 Creating backup on ${environment}...\n`);

  const foldersToBackup = getFoldersToBackup(options);
  const remotePath = envConfig.remotePath;
  const backupsDir = `${remotePath}/backups`;
  const dbConfig = envConfig.database;

  // Show what will be backed up
  if (options.dryRun) {
    console.log('🔍 Dry run - would create backups for:');
    for (const folder of foldersToBackup) {
      const backupName = generateBackupName(folder.name);
      console.log(`   📁 ${folder.path} → backups/${backupName}`);
    }
    if (options.database) {
      const dbBackupName = generateBackupName('database');
      console.log(`   🗄️  database → backups/${dbBackupName}`);
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

    // Create database backup if requested
    if (options.database) {
      console.log(`\n⏳ Backing up database...`);
      
      if (!dbConfig) {
        console.log(`   ⚠️  Skipping database - no database configuration found`);
      } else {
        const dbBackupName = generateBackupName('database');
        const sqlFile = `${backupsDir}/database.sql`;
        const backupPath = `${backupsDir}/${dbBackupName}`;
        
        // Build mysqldump command with table prefix if configured
        const tablePrefix = dbConfig.tablePrefix || '';
        let mysqldumpCmd = `mysqldump -h "${dbConfig.host}" -u "${dbConfig.user}" -p"${dbConfig.password}" "${dbConfig.name}"`;
        
        // If table prefix is set, only backup tables with that prefix
        if (tablePrefix) {
          // Get list of tables with the prefix
          const getTablesCmd = `mysql -h "${dbConfig.host}" -u "${dbConfig.user}" -p"${dbConfig.password}" -N -e "SHOW TABLES LIKE '${tablePrefix}%'" "${dbConfig.name}"`;
          const tablesResult = await transfer.exec(getTablesCmd);
          
          if (tablesResult.code !== 0) {
            console.error(`   ❌ Failed to get tables: ${tablesResult.stderr}`);
          } else {
            const tables = tablesResult.stdout.trim().split('\n').filter(t => t);
            if (tables.length === 0) {
              console.log(`   ⚠️  No tables found with prefix '${tablePrefix}'`);
            } else {
              console.log(`   📋 Found ${tables.length} tables with prefix '${tablePrefix}'`);
              mysqldumpCmd = `mysqldump -h "${dbConfig.host}" -u "${dbConfig.user}" -p"${dbConfig.password}" "${dbConfig.name}" ${tables.join(' ')}`;
            }
          }
        }
        
        // Run mysqldump and create archive
        const dumpCmd = `${mysqldumpCmd} > "${sqlFile}" && tar -czf "${backupPath}" -C "${backupsDir}" database.sql && rm "${sqlFile}"`;
        const result = await transfer.exec(dumpCmd);
        
        if (result.code !== 0) {
          console.error(`   ❌ Failed to backup database: ${result.stderr}`);
        } else {
          // Get backup file size
          const sizeResult = await transfer.exec(`du -h "${backupPath}" | cut -f1`);
          const size = sizeResult.stdout.trim() || 'unknown size';
          console.log(`   ✅ Created: backups/${dbBackupName} (${size})`);
        }
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
export async function listBackups(environmentId: string, config: SiteConfig): Promise<void> {
  // Resolve environment (supports exact domain, type, or fuzzy match)
  const environment = await resolveEnvironmentOrExit(environmentId, config);
  const envConfig = config.environments[environment];

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

/**
 * Helper to get list of backups from remote
 */
async function getBackupsList(transfer: SSHTransfer, backupsDir: string): Promise<BackupFile[]> {
  const result = await transfer.exec(
    `ls -lh "${backupsDir}" 2>/dev/null | grep -E '\\.tar\\.gz$' | awk '{print $9, $5}'`
  );

  if (result.code !== 0 || !result.stdout.trim()) {
    return [];
  }

  const lines = result.stdout.trim().split('\n');
  return lines.map((line) => {
    const parts = line.split(' ');
    const name = parts[0];
    const size = parts[1] || 'unknown';
    return {
      name,
      size,
      fullPath: `${backupsDir}/${name}`,
    };
  });
}

/**
 * Interactive backup deletion
 */
export async function deleteBackups(
  environmentId: string,
  config: SiteConfig,
  deleteAll: boolean = false
): Promise<void> {
  // Resolve environment (supports exact domain, type, or fuzzy match)
  const environment = await resolveEnvironmentOrExit(environmentId, config);
  const envConfig = config.environments[environment];

  if (!envConfig?.ssh) {
    console.error('❌ Delete backups is only available for remote environments.');
    process.exit(1);
  }

  console.log(`\n🗑️  Delete backups on ${environment}...\n`);
  console.log(`🔌 Connecting to ${envConfig.ssh.host}...`);

  const transfer = new SSHTransfer(envConfig);

  try {
    await transfer.connect();
    console.log('✅ Connected!\n');

    const backupsDir = `${envConfig.remotePath}/backups`;
    const backups = await getBackupsList(transfer, backupsDir);

    if (backups.length === 0) {
      console.log('   No backups found.');
      return;
    }

    if (deleteAll) {
      // Delete all with confirmation
      console.log(`⚠️  This will delete ALL ${backups.length} backup(s):`);
      for (const backup of backups) {
        console.log(`   📦 ${backup.name} (${backup.size})`);
      }
      console.log('');

      // Simple confirmation using readline
      const readline = await import('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const answer = await new Promise<string>((resolve) => {
        rl.question('Are you sure you want to delete ALL backups? (yes/no): ', resolve);
      });
      rl.close();

      if (answer.toLowerCase() !== 'yes') {
        console.log('\n❌ Cancelled.');
        return;
      }

      // Delete all
      console.log('\n🗑️  Deleting all backups...');
      for (const backup of backups) {
        const result = await transfer.exec(`rm -f "${backup.fullPath}"`);
        if (result.code === 0) {
          console.log(`   ✅ Deleted: ${backup.name}`);
        } else {
          console.log(`   ❌ Failed to delete: ${backup.name}`);
        }
      }
      console.log('\n✅ Done!');
    } else {
      // Interactive selection
      await new Promise<void>((resolve) => {
        const { unmount } = render(
          React.createElement(BackupSelector, {
            backups,
            action: 'delete',
            onSelect: async (selected: BackupFile[]) => {
              unmount();
              console.log(`\n🗑️  Deleting ${selected.length} backup(s)...`);

              for (const backup of selected) {
                const result = await transfer.exec(`rm -f "${backup.fullPath}"`);
                if (result.code === 0) {
                  console.log(`   ✅ Deleted: ${backup.name}`);
                } else {
                  console.log(`   ❌ Failed to delete: ${backup.name}`);
                }
              }
              console.log('\n✅ Done!');
              resolve();
            },
            onCancel: () => {
              unmount();
              console.log('\n❌ Cancelled.');
              resolve();
            },
          })
        );
      });
    }
  } catch (error) {
    const err = error as Error;
    console.error(`\n❌ Delete failed: ${err.message}`);
    process.exit(1);
  } finally {
    await transfer.disconnect();
  }
}

/**
 * Download backups to local machine
 */
export async function downloadBackups(
  environmentId: string,
  config: SiteConfig,
  downloadAll: boolean = false,
  outputDir: string = './backups'
): Promise<void> {
  // Resolve environment (supports exact domain, type, or fuzzy match)
  const environment = await resolveEnvironmentOrExit(environmentId, config);
  const envConfig = config.environments[environment];

  if (!envConfig?.ssh) {
    console.error('❌ Download backups is only available for remote environments.');
    process.exit(1);
  }

  console.log(`\n📥 Download backups from ${environment}...\n`);
  console.log(`🔌 Connecting to ${envConfig.ssh.host}...`);

  const transfer = new SSHTransfer(envConfig);

  try {
    await transfer.connect();
    console.log('✅ Connected!\n');

    const backupsDir = `${envConfig.remotePath}/backups`;
    const backups = await getBackupsList(transfer, backupsDir);

    if (backups.length === 0) {
      console.log('   No backups found.');
      return;
    }

    // Ensure local output directory exists
    const absoluteOutputDir = path.resolve(outputDir);
    await fs.mkdir(absoluteOutputDir, { recursive: true });

    const downloadBackupFiles = async (selected: BackupFile[]) => {
      console.log(`\n📥 Downloading ${selected.length} backup(s) to ${absoluteOutputDir}...`);

      for (const backup of selected) {
        const localPath = path.join(absoluteOutputDir, backup.name);
        console.log(`\n   ⏳ Downloading: ${backup.name} (${backup.size})...`);

        try {
          await transfer.downloadFile(backup.fullPath, localPath);
          console.log(`   ✅ Downloaded: ${backup.name}`);
        } catch (err) {
          const error = err as Error;
          console.log(`   ❌ Failed: ${backup.name} - ${error.message}`);
        }
      }
      console.log('\n✅ Done!');
    };

    if (downloadAll) {
      await downloadBackupFiles(backups);
    } else {
      // Interactive selection
      await new Promise<void>((resolve) => {
        const { unmount } = render(
          React.createElement(BackupSelector, {
            backups,
            action: 'download',
            onSelect: async (selected: BackupFile[]) => {
              unmount();
              await downloadBackupFiles(selected);
              resolve();
            },
            onCancel: () => {
              unmount();
              console.log('\n❌ Cancelled.');
              resolve();
            },
          })
        );
      });
    }
  } catch (error) {
    const err = error as Error;
    console.error(`\n❌ Download failed: ${err.message}`);
    process.exit(1);
  } finally {
    await transfer.disconnect();
  }
}

/**
 * Restore files from a backup on the remote environment
 */
export async function restoreBackup(
  environmentId: string,
  config: SiteConfig,
  dryRun: boolean = false
): Promise<void> {
  // Resolve environment (supports exact domain, type, or fuzzy match)
  const environment = await resolveEnvironmentOrExit(environmentId, config);
  const envConfig = config.environments[environment];

  if (!envConfig?.ssh) {
    console.error('❌ Restore backup is only available for remote environments.');
    process.exit(1);
  }

  console.log(`\n🔄 Restore backup on ${environment}...\n`);
  console.log(`🔌 Connecting to ${envConfig.ssh.host}...`);

  const transfer = new SSHTransfer(envConfig);

  try {
    await transfer.connect();
    console.log('✅ Connected!\n');

    const backupsDir = `${envConfig.remotePath}/backups`;
    const backups = await getBackupsList(transfer, backupsDir);

    if (backups.length === 0) {
      console.log('   No backups found to restore.');
      return;
    }

    // Interactive single selection
    await new Promise<void>((resolve) => {
      const { unmount } = render(
        React.createElement(BackupSelector, {
          backups,
          action: 'restore',
          singleSelect: true,
          onSelect: async (selected: BackupFile[]) => {
            unmount();
            const backup = selected[0];
            const isDatabase = backup.name.includes('-database.');

            if (dryRun) {
              console.log(`\n🔍 Dry run - would restore from: ${backup.name}`);
              console.log(`   Archive: ${backup.fullPath}`);
              if (isDatabase) {
                console.log(`   Type: Database backup`);
                console.log(`   Target: ${envConfig.database?.name || 'configured database'}`);
              } else {
                console.log(`   Type: Files backup`);
                console.log(`   Target: ${envConfig.remotePath}`);
              }
              
              // Show contents of the archive
              console.log('\n   Contents:');
              const listResult = await transfer.exec(`tar -tzf "${backup.fullPath}" | head -20`);
              if (listResult.code === 0) {
                const files = listResult.stdout.trim().split('\n');
                for (const file of files) {
                  console.log(`     ${file}`);
                }
                if (files.length >= 20) {
                  console.log('     ... (more files)');
                }
              }
              resolve();
              return;
            }

            if (isDatabase) {
              console.log(`\n⚠️  This will replace tables in the database!`);
              console.log(`   Backup: ${backup.name} (${backup.size})`);
              console.log(`   Database: ${envConfig.database?.name || 'configured database'}`);
            } else {
              console.log(`\n⚠️  This will overwrite existing files!`);
              console.log(`   Backup: ${backup.name} (${backup.size})`);
              console.log(`   Target: ${envConfig.remotePath}`);
            }
            console.log('');

            // Confirmation
            const readline = await import('readline');
            const rl = readline.createInterface({
              input: process.stdin,
              output: process.stdout,
            });

            const answer = await new Promise<string>((res) => {
              rl.question('Are you sure you want to restore this backup? (yes/no): ', res);
            });
            rl.close();

            if (answer.toLowerCase() !== 'yes') {
              console.log('\n❌ Cancelled.');
              resolve();
              return;
            }

            console.log('\n🔄 Restoring backup...');

            if (isDatabase) {
              // Database restore
              const dbConfig = envConfig.database;
              if (!dbConfig) {
                console.error(`\n❌ No database configuration found for this environment`);
                resolve();
                return;
              }

              // Extract SQL file and import to database
              const tempDir = `${envConfig.remotePath}/backups/.temp`;
              const extractCmd = `mkdir -p "${tempDir}" && tar -xzf "${backup.fullPath}" -C "${tempDir}"`;
              const extractResult = await transfer.exec(extractCmd);

              if (extractResult.code !== 0) {
                console.error(`\n❌ Failed to extract backup: ${extractResult.stderr}`);
                resolve();
                return;
              }

              // Import the SQL file
              const importCmd = `mysql -h "${dbConfig.host}" -u "${dbConfig.user}" -p"${dbConfig.password}" "${dbConfig.name}" < "${tempDir}/database.sql"`;
              const importResult = await transfer.exec(importCmd);

              // Clean up temp directory
              await transfer.exec(`rm -rf "${tempDir}"`);

              if (importResult.code !== 0) {
                console.error(`\n❌ Database restore failed: ${importResult.stderr}`);
              } else {
                console.log(`\n✅ Database restored successfully from: ${backup.name}`);
              }
            } else {
              // Files restore
              const extractCmd = `cd "${envConfig.remotePath}" && tar -xzf "${backup.fullPath}"`;
              const result = await transfer.exec(extractCmd);

              if (result.code !== 0) {
                console.error(`\n❌ Restore failed: ${result.stderr}`);
              } else {
                console.log(`\n✅ Restored successfully from: ${backup.name}`);
                
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
              }
            }
            resolve();
          },
          onCancel: () => {
            unmount();
            console.log('\n❌ Cancelled.');
            resolve();
          },
        })
      );
    });
  } catch (error) {
    const err = error as Error;
    console.error(`\n❌ Restore failed: ${err.message}`);
    process.exit(1);
  } finally {
    await transfer.disconnect();
  }
}
