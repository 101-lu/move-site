#!/usr/bin/env node

import { program } from 'commander';
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { runConfigWizard, loadConfig, configExists } from '../src/config/index.js';
import { runUpload } from '../src/commands/upload.js';
import type { UploadOptions, EnvironmentType } from '../src/types/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const packageJson = require(join(__dirname, '..', '..', 'package.json'));

program
  .name('move-site')
  .description('CLI tool for moving website files and databases between environments')
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
  .action(async (environment: string, options: UploadOptions) => {
    // Check if config exists
    if (!(await configExists())) {
      console.log('No configuration found. Running setup wizard...\n');
      await runConfigWizard();
    }

    const config = await loadConfig();
    if (!config) {
      console.error('Failed to load configuration. Please run: move-site config');
      process.exit(1);
    }

    if (!config.environments[environment as EnvironmentType]) {
      console.error(`Environment "${environment}" not found in configuration.`);
      console.error(`Available environments: ${Object.keys(config.environments).join(', ')}`);
      process.exit(1);
    }

    await runUpload(environment, options, config);
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
