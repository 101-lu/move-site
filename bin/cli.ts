#!/usr/bin/env node

import { program } from 'commander';
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { runConfigWizard, loadConfig, configExists } from '../src/config/index.js';
import { runUpload } from '../src/commands/upload.js';
import { runBackup, listBackups, deleteBackups, downloadBackups, restoreBackup } from '../src/commands/backup.js';
import type { UploadOptions } from '../src/types/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const packageJson = require(join(__dirname, '..', '..', 'package.json'));

/**
 * Helper to load and validate config for an environment
 */
async function getConfigForEnv(environment: string) {
  if (!(await configExists())) {
    console.log('No configuration found. Running setup wizard...\n');
    await runConfigWizard();
  }

  const config = await loadConfig();
  if (!config) {
    console.error('Failed to load configuration. Please run: move-site config');
    process.exit(1);
  }

  if (!config.environments[environment]) {
    console.error(`Environment "${environment}" not found in configuration.`);
    console.error(`Available environments: ${Object.keys(config.environments).join(', ')}`);
    process.exit(1);
  }

  return config;
}

program
  .name('move-site')
  .description('CLI tool for moving website files and databases between environments\n© 2025 101 Studios')
  .version(packageJson.version);

// Config command
program
  .command('config')
  .description('Create or update the configuration file')
  .option('-f, --force', 'Overwrite existing configuration')
  .action(async (options: { force?: boolean }) => {
    await runConfigWizard(options.force ?? false);
  });

// Upload command
program
  .command('upload <environment>')
  .description('Upload files to a remote environment')
  .option('--all', 'Upload all files')
  .option('--uploads', 'Upload the uploads folder (wp-content/uploads)')
  .option('--plugins', 'Upload the plugins folder (wp-content/plugins)')
  .option('--themes', 'Upload the themes folder (wp-content/themes)')
  .option('--core', 'Upload WordPress core files')
  .option('--database', 'Export and upload the database')
  .option('--dry-run', 'Show what would be uploaded without actually uploading')
  .option('--verbose', 'Show all files in dry-run mode (instead of first 5)')
  .option('--no-backup', 'Skip creating a backup before uploading')
  .action(async (environment: string, options: UploadOptions) => {
    const config = await getConfigForEnv(environment);
    await runUpload(environment, options, config);
  });

// Backup command group
const backupCmd = program
  .command('backup')
  .description('Manage backups on remote environments');

// backup create
backupCmd
  .command('create <environment>')
  .description('Create a backup of files or database on a remote environment')
  .option('--all', 'Backup all files (excluding backups folder)')
  .option('--uploads', 'Backup the uploads folder (wp-content/uploads)')
  .option('--plugins', 'Backup the plugins folder (wp-content/plugins)')
  .option('--themes', 'Backup the themes folder (wp-content/themes)')
  .option('--core', 'Backup WordPress core files')
  .option('--database', 'Backup the database (mysqldump)')
  .option('--dry-run', 'Show what would be backed up without creating backups')
  .action(async (environment: string, options: UploadOptions) => {
    const config = await getConfigForEnv(environment);
    await runBackup(environment, options, config);
  });

// backup list
backupCmd
  .command('list <environment>')
  .description('List existing backups on a remote environment')
  .action(async (environment: string) => {
    const config = await getConfigForEnv(environment);
    await listBackups(environment, config);
  });

// backup delete
backupCmd
  .command('delete <environment>')
  .description('Interactively select and delete backups from a remote environment')
  .option('--all', 'Delete all backups (with confirmation)')
  .action(async (environment: string, options: { all?: boolean }) => {
    const config = await getConfigForEnv(environment);
    await deleteBackups(environment, config, options.all);
  });

// backup download
backupCmd
  .command('download <environment>')
  .description('Download backups from a remote environment to local machine')
  .option('--all', 'Download all backups')
  .option('-o, --output <path>', 'Local directory to save backups', './backups')
  .action(async (environment: string, options: { all?: boolean; output: string }) => {
    const config = await getConfigForEnv(environment);
    await downloadBackups(environment, config, options.all, options.output);
  });

// backup restore
backupCmd
  .command('restore <environment>')
  .description('Restore files from a backup on a remote environment')
  .option('--dry-run', 'Show what would be restored without actually restoring')
  .action(async (environment: string, options: { dryRun?: boolean }) => {
    const config = await getConfigForEnv(environment);
    await restoreBackup(environment, config, options.dryRun);
  });

// Download command (placeholder for future)
program
  .command('download <environment>')
  .description('Download files from a remote environment')
  .option('--all', 'Download all files')
  .option('--uploads', 'Download the uploads folder')
  .option('--plugins', 'Download the plugins folder')
  .option('--themes', 'Download the themes folder')
  .option('--database', 'Download and import the database')
  .action(async (_environment: string, _options: UploadOptions) => {
    console.log('Download command coming soon!');
  });

// Parse arguments
program.parse();

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
