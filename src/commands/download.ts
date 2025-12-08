import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import type { SiteConfig } from '../types/index.js';
import { resolveEnvironmentOrExit } from '../config/resolver.js';
import { SSHTransfer } from '../transfer/ssh.js';

/**
 * Generate a zip name similar to WP Migrate Local format
 */
function generateWPMLZipName(domain: string): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const yy = String(now.getFullYear()).slice(-2);
  const sanitized = domain.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-_.]/g, '-');
  return `${sanitized}-${mm}${dd}${yy}-backup.zip`;
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
  full: boolean = false,
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
      const dumpCmd = `mysqldump ${connArgs} \"${db.name}\" > \"${tmpDir}/backup.sql\"`;
      console.log('🗄️  Creating database dump...');
      const dumpResult = await transfer.exec(dumpCmd);
      if (dumpResult.code !== 0) {
        console.log(`   ⚠️  mysqldump failed: ${dumpResult.stderr || dumpResult.stdout}`);
      } else {
        console.log('   ✅ Database dump created');
      }
    }

    const zipName = generateWPMLZipName(environment);
    let remoteZip = `${tmpDir}/${zipName}`;

    // Check if zip command exists on remote
    const zipCheck = await transfer.exec('command -v zip || true');
    const zipExists = zipCheck.stdout.trim().length > 0;

    if (!zipExists) {
      console.log('⚠️  zip utility not found on remote. Attempting to use tar.gz instead.');
    }

    if (full) {
      // Create an archive of all files in remotePath
      if (zipExists) {
        // Use zip to create a full zip
        console.log('📦 Creating full site zip...');
        // Exclude backups folder to avoid recursion
        const zipCmd = `cd \"${remotePath}\" && zip -r \"${remoteZip}\" . -x './backups/*'`;
        const zipResult = await transfer.exec(zipCmd);
        if (zipResult.code !== 0) {
          throw new Error(`Failed to create zip: ${zipResult.stderr}`);
        }
      } else {
        // Fall back to tar.gz
        console.log('📦 Creating full site tar.gz (fallback)...');
        const tarPath = `${tmpDir}/${zipName.replace(/\.zip$/, '.tar.gz')}`;
        const tarCmd = `cd \"${remotePath}\" && tar -czf \"${tarPath}\" --exclude='./backups' .`;
        const tarResult = await transfer.exec(tarCmd);
        if (tarResult.code !== 0) {
          throw new Error(`Failed to create tar.gz: ${tarResult.stderr}`);
        }
        // Update remoteZip to tar.gz path
        // eslint-disable-next-line no-param-reassign
        (remoteZip as any) = tarPath; // cast to any to assign; not ideal but ok
      }
    } else {
      // WP Migrate Local format: backup.sql + wp-content
      if (zipExists) {
        console.log('📦 Creating wp-content + backup.zip...');
        // zip the wp-content directory and then add backup.sql (if exists)
        const zipCmdParts: string[] = [];
        // Create zip from wp-content relative to remotePath
        zipCmdParts.push(`cd \"${remotePath}\" && zip -r \"${remoteZip}\" wp-content || true`);
        // If backup.sql exists in tmpDir, add it to zip
        zipCmdParts.push(`if [ -f \"${tmpDir}/backup.sql\" ]; then cd \"${tmpDir}\" && zip -u \"${remoteZip}\" backup.sql; fi`);
        const zipCmd = zipCmdParts.join(' && ');
        const zipResult = await transfer.exec(zipCmd);
        if (zipResult.code !== 0) {
          throw new Error(`Failed to create wpml zip: ${zipResult.stderr || zipResult.stdout}`);
        }
      } else {
        // tar fallback - create tar.gz containing backup.sql and wp-content
        const tarPath = `${tmpDir}/${zipName.replace(/\.zip$/, '.tar.gz')}`;
        console.log('📦 Creating wp-content + backup.tar.gz (fallback)...');
        const tarCmd = `mkdir -p \"${tmpDir}\" && cp -r \"${remotePath}/wp-content\" \"${tmpDir}/wp-content\" 2>/dev/null || true && tar -czf \"${tarPath}\" -C \"${tmpDir}\" .`;
        const tarResult = await transfer.exec(tarCmd);
        if (tarResult.code !== 0) {
          throw new Error(`Failed to create tar.gz: ${tarResult.stderr || tarResult.stdout}`);
        }
        // eslint-disable-next-line no-param-reassign
        (remoteZip as any) = tarPath;
      }
    }

    // Download file to local outputDir
    await fs.mkdir(outputDir, { recursive: true });
    const localPath = path.join(outputDir, `${zipName}`);

    console.log(`\n📥 Downloading archive to ${localPath}...`);
    await transfer.downloadFile(remoteZip, localPath);
    console.log('   ✅ Download complete');

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
