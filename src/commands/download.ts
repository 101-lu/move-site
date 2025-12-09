import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import type { SiteConfig } from '../types/index.js';
import { resolveEnvironmentOrExit } from '../config/resolver.js';
import { SSHTransfer } from '../transfer/ssh.js';

/**
 * Generate a zip name similar to WP Migrate format
 */
function generateWPMLZipName(domain: string): string {
  const now = new Date();
  const YYYY = now.getFullYear();
  const MM = String(now.getMonth() + 1).padStart(2, '0');
  const DD = String(now.getDate()).padStart(2, '0');
  const HH = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const SS = String(now.getSeconds()).padStart(2, '0');
  const sanitized = domain.replace(/https?:\/\//, '').replace(/[^a-zA-Z0-9-_.]/g, '-');
  return `${sanitized}-${YYYY}${MM}${DD}${HH}${mm}${SS}.zip`;
}

/**
 * Build mysql connection args string for remote mysqldump/mysql
 */
function buildMysqlConnectionArgs(db: any): string {
  let args = '';
  // Use socket if available
  if (db?.socket) {
    args += ` --socket=\"${db.socket}\"`;
  } else {
    if (db?.host) {
      args += ` -h \"${db.host}\"`;
    }
    if (db?.port) {
      args += ` -P ${db.port}`;
    }
  }
  if (db?.user) {
    args += ` -u \"${db.user}\"`;
  }
  if (db?.password) {
    args += ` -p\"${db.password}\"`;
  }
  return args;
}

export async function runDownload(
  environmentId: string,
  config: SiteConfig,
  outputDir: string = '.'
): Promise<void> {
  const environment = await resolveEnvironmentOrExit(environmentId, config);
  const envConfig = config.environments[environment];
  if (!envConfig) {
    console.error(`❌ Environment "${environment}" not found`);
    process.exit(1);
  }
  if (!envConfig.ssh) {
    console.error('❌ Download is only supported for remote environments (SSH required).');
    process.exit(1);
  }

  const transfer = new SSHTransfer(envConfig);

  try {
    console.log(`\n🔌 Connecting to ${envConfig.ssh.host}...`);
    await transfer.connect();
    console.log('✅ Connected!\n');

    const remotePath = envConfig.remotePath;
    const backupsDir = `${remotePath}/backups`;
    const tmpDir = `${backupsDir}/.move-site-download-${Date.now()}`;

    // Ensure backups dir and temp dir
    await transfer.exec(`mkdir -p "${backupsDir}" && mkdir -p "${tmpDir}"`);

    // Create database dump (if possible)
    const db = envConfig.database;
    if (!db) {
      console.log('⚠️  No database configured for this environment - skipping database dump');
    } else {
      const connArgs = buildMysqlConnectionArgs(db);

      // Test database connection first
      console.log('🔗 Testing database connection...');
      const testCmd = `mysql ${connArgs} -e "SELECT 1;" \"${db.name}\"`;
      const testResult = await transfer.exec(testCmd);
      if (testResult.code !== 0) {
        console.error('❌ Database connection failed!');
        console.error('Error details:');
        if (testResult.stderr) {
          console.error(testResult.stderr);
        }
        if (testResult.stdout) {
          console.error(testResult.stdout);
        }
        console.error('\nPlease check:');
        console.error('  - Database host, port, and credentials');
        console.error('  - Database name exists');
        console.error('  - MySQL/MariaDB server is accessible');
        console.error('  - Firewall/network connectivity');
        process.exit(1);
      }
      console.log('   ✅ Database connection successful');

      // Create database dump with WP Migrate compatible format
      const dumpCmd = `mysqldump --single-transaction --routines --triggers --add-drop-table --skip-lock-tables --skip-add-locks --extended-insert --no-tablespaces --default-character-set=utf8mb4 ${connArgs} \"${db.name}\" > \"${tmpDir}/database_raw.sql\"`;
      console.log('🗄️  Creating database dump...');
      const dumpResult = await transfer.exec(dumpCmd);
      if (dumpResult.code !== 0) {
        console.error('❌ Database dump failed!');
        console.error('Error details:');
        if (dumpResult.stderr) {
          console.error(dumpResult.stderr);
        }
        if (dumpResult.stdout) {
          console.error(dumpResult.stdout);
        }
        process.exit(1);
      }

      // Check if dump file has content
      const checkCmd = `if [ -s \"${tmpDir}/database_raw.sql\" ]; then echo "has_content"; else echo "empty"; fi`;
      const checkResult = await transfer.exec(checkCmd);
      if (checkResult.stdout.trim() !== "has_content") {
        console.error('❌ Database dump file is empty. This should not happen if the connection test passed.');
        console.error('Please check your database configuration.');
        process.exit(1);
      }

      // Create WP Migrate compatible header and combine with dump
      const now = new Date();
      const timestamp = now.toUTCString().replace('GMT', 'UTC');
      const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });
      const dateStr = `${dayName} ${now.getDate()}. ${now.toLocaleDateString('en-US', { month: 'long' })} ${now.getFullYear()} ${now.toTimeString().split(' ')[0]} UTC`;

      // Get table list for header
      const tableCmd = `mysql ${connArgs} -e "SHOW TABLES;" \"${db.name}\" | tail -n +2 | tr '\n' ',' | sed 's/,$//'`;
      const tableResult = await transfer.exec(tableCmd);
      const tables = tableResult.stdout.trim() || 'N/A';

      // Get post types (simplified)
      const postTypes = 'revision, about, aboutus, acf-field, acf-field-group, activities, attachment, certificate_types, certificates, contacts, contactspage, flamingo_contact, flamingo_inbound, footer, jobs, jobspage, nav_menu_item, page, post, qualitylabels, wp_navigation, wpcf7_contact_form';

      const header = `# WordPress MySQL database migration
#
# Generated: ${dateStr}
# Hostname: localhost:3306
# Database: \`${db.name}\`
# URL: ${envConfig.url}
# Path: ${remotePath}
# Tables: ${tables}
# Table Prefix: ${db.tablePrefix || 'wp_'}
# Post Types: ${postTypes}
# Protocol: https
# Multisite: false
# Subsite Export: false
#

/*!40101 SET NAMES utf8 */;

SET sql_mode='NO_AUTO_VALUE_ON_ZERO';
`;

      // Create header file
      const headerCmd = `cat > \"${tmpDir}/database.sql\" << 'EOF'
${header}
EOF`;
      const headerResult = await transfer.exec(headerCmd);
      if (headerResult.code !== 0) {
        console.error('❌ Failed to create database header!');
        console.error('Error details:');
        if (headerResult.stderr) {
          console.error(headerResult.stderr);
        }
        if (headerResult.stdout) {
          console.error(headerResult.stdout);
        }
        process.exit(1);
      }

      // Filter database dump to remove MySQL version-specific commands
      const filterCmd = `grep -v '^/\\*![0-9]' \"${tmpDir}/database_raw.sql\" >> \"${tmpDir}/database.sql\"`;
      const filterResult = await transfer.exec(filterCmd);
      if (filterResult.code !== 0) {
        console.error('❌ Failed to filter database dump!');
        console.error('Error details:');
        if (filterResult.stderr) {
          console.error(filterResult.stderr);
        }
        if (filterResult.stdout) {
          console.error(filterResult.stdout);
        }
        process.exit(1);
      }

      // Cleanup temporary file
      const cleanupCmd = `rm \"${tmpDir}/database_raw.sql\"`;
      const cleanupResult = await transfer.exec(cleanupCmd);
      if (cleanupResult.code !== 0) {
        console.error('❌ Failed to cleanup temporary files!');
        console.error('Error details:');
        if (cleanupResult.stderr) {
          console.error(cleanupResult.stderr);
        }
        if (cleanupResult.stdout) {
          console.error(cleanupResult.stdout);
        }
        process.exit(1);
      }

      console.log('   ✅ Database dump created');
    }

    // Copy all WordPress files to files/ subdirectory
    console.log('📁 Copying WordPress files...');

    // Check if rsync is available
    const rsyncCheck = await transfer.exec('command -v rsync || true');
    const rsyncExists = rsyncCheck.stdout.trim().length > 0;

    let copyResult;
    if (rsyncExists) {
      // Build rsync exclude options from config
      const excludeOpts = config.options.excludePatterns.map(pattern => `--exclude='${pattern}'`).join(' ');
      const copyCmd = `rsync -av ${excludeOpts} \"${remotePath}/\" \"${tmpDir}/files/\"`;
      copyResult = await transfer.exec(copyCmd);
    } else {
      // Fallback: use tar to copy files excluding patterns
      console.log('   ⚠️  rsync not available, using tar (may include some excluded files)');
      const excludeOpts = config.options.excludePatterns.map(pattern => `--exclude='${pattern}'`).join(' ');
      const copyCmd = `mkdir -p \"${tmpDir}/files\" && cd \"${remotePath}\" && tar -cf - ${excludeOpts} . | tar -xf - -C \"${tmpDir}/files\"`;
      copyResult = await transfer.exec(copyCmd);
    }

    if (copyResult.code !== 0) {
      console.log(`   ⚠️  File copy failed: ${copyResult.stderr || copyResult.stdout}`);
    } else {
      console.log('   ✅ Files copied');
    }

    const zipName = generateWPMLZipName(environment);

    // Create wpmigrate-export.json (WP Migrate format)
    const wpMigrateData = {
      name: config.name || environment,
      domain: envConfig.url,
      path: remotePath,
      wpVersion: "6.9", // TODO: detect actual version
      services: {
        php: { name: "php", version: "8.0.30" }, // TODO: detect actual versions
        mariadb: { name: "mariadb", version: "10.6.18-MariaDB" },
        apache: { name: "apache" }
      },
      wpMigrate: { version: "2.7.7" }
    };
    const wpMigrateJson = JSON.stringify(wpMigrateData);
    const wpMigrateCmd = `cat > \"${tmpDir}/wpmigrate-export.json\" << 'EOF'\n${wpMigrateJson}\nEOF`;
    await transfer.exec(wpMigrateCmd);
    console.log('   ✅ Export metadata created');

    let remoteZip = `${backupsDir}/${zipName}`;

    // Check if zip command exists on remote
    const zipCheck = await transfer.exec('command -v zip || true');
    const zipExists = zipCheck.stdout.trim().length > 0;

    if (!zipExists) {
      console.log('⚠️  zip utility not found on remote. Attempting to use tar.gz instead.');
      const tarPath = `${remoteZip.replace(/\.zip$/, '.tar.gz')}`;
      const tarCmd = `cd \"${tmpDir}\" && tar -czf \"${tarPath}\" .`;
      const tarResult = await transfer.exec(tarCmd);
      if (tarResult.code !== 0) {
        throw new Error(`Failed to create tar.gz: ${tarResult.stderr}`);
      }
      remoteZip = tarPath;
    } else {
      // Create zip from tmpDir contents
      console.log('📦 Creating WP Migrate compatible zip...');
      const zipCmd = `cd \"${tmpDir}\" && zip -r \"${remoteZip}\" .`;
      const zipResult = await transfer.exec(zipCmd);
      if (zipResult.code !== 0) {
        throw new Error(`Failed to create zip: ${zipResult.stderr}`);
      }
    }

    // Download file to local outputDir
    await fs.mkdir(outputDir, { recursive: true });
    const localPath = path.join(outputDir, `${zipName}`);

    console.log(`\n📥 Downloading archive to ${localPath}...`);

    let lastProgressTime = Date.now();
    let lastTransferred = 0;
    let speed = 0;

    await transfer.downloadFile(remoteZip, localPath, (progress) => {
      const now = Date.now();
      const timeDiff = (now - lastProgressTime) / 1000; // seconds

      if (timeDiff >= 1) { // Update every second
        const bytesDiff = progress.completed - lastTransferred;
        speed = bytesDiff / timeDiff; // bytes per second

        const percentage = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
        const completedMB = (progress.completed / (1024 * 1024)).toFixed(1);
        const totalMB = (progress.total / (1024 * 1024)).toFixed(1);
        const speedMB = (speed / (1024 * 1024)).toFixed(1);

        process.stdout.write(`\r   📥 ${percentage}% (${completedMB}MB / ${totalMB}MB) at ${speedMB}MB/s`);
        lastProgressTime = now;
        lastTransferred = progress.completed;
      }
    });

    console.log('\n   ✅ Download complete');

    // Cleanup remote temporary files
    await transfer.exec(`rm -rf "${tmpDir}" ${remoteZip}`);
    console.log('   ✅ Cleaned up remote temporary files');
  } catch (error) {
    const err = error as Error;
    console.error(`\n❌ Download failed: ${err.message}`);
    process.exit(1);
  } finally {
    await transfer.disconnect();
  }
}
