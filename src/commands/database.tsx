import React, { useState, FC } from 'react';
import { render, Box, Text, useApp, useInput } from 'ink';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { SSHTransfer } from '../transfer/ssh.js';
import type { SiteConfig, EnvironmentConfig } from '../types/index.js';

const execAsync = promisify(exec);

/**
 * WordPress URL replacement queries
 */
const WP_URL_REPLACE_QUERIES = (tablePrefix: string, oldUrl: string, newUrl: string) => [
  // Update site options (home and siteurl)
  `UPDATE ${tablePrefix}options SET option_value = REPLACE(option_value, '${oldUrl}', '${newUrl}') WHERE option_name = 'home' OR option_name = 'siteurl';`,
  // Update post GUIDs
  `UPDATE ${tablePrefix}posts SET guid = REPLACE(guid, '${oldUrl}', '${newUrl}');`,
  // Update post content
  `UPDATE ${tablePrefix}posts SET post_content = REPLACE(post_content, '${oldUrl}', '${newUrl}');`,
  // Update post meta
  `UPDATE ${tablePrefix}postmeta SET meta_value = REPLACE(meta_value, '${oldUrl}', '${newUrl}');`,
  // Update comments
  `UPDATE ${tablePrefix}comments SET comment_content = REPLACE(comment_content, '${oldUrl}', '${newUrl}');`,
  `UPDATE ${tablePrefix}comments SET comment_author_url = REPLACE(comment_author_url, '${oldUrl}', '${newUrl}');`,
  // Update term meta (for custom URLs in taxonomies)
  `UPDATE ${tablePrefix}termmeta SET meta_value = REPLACE(meta_value, '${oldUrl}', '${newUrl}');`,
];

/**
 * Get local environments from config
 */
export function getLocalEnvironments(config: SiteConfig): { domain: string; env: EnvironmentConfig }[] {
  return Object.entries(config.environments)
    .filter(([_, env]) => env.type === 'local')
    .map(([domain, env]) => ({ domain, env }));
}

/**
 * Simple environment selector component
 */
interface EnvSelectorProps {
  environments: { domain: string; env: EnvironmentConfig }[];
  onSelect: (selected: { domain: string; env: EnvironmentConfig }) => void;
  onCancel: () => void;
}

const EnvironmentSelector: FC<EnvSelectorProps> = ({ environments, onSelect, onCancel }) => {
  const { exit } = useApp();
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((input, key) => {
    if (key.escape || input === 'q') {
      onCancel();
      exit();
    } else if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow) {
      setSelectedIndex((i) => Math.min(environments.length - 1, i + 1));
    } else if (key.return) {
      onSelect(environments[selectedIndex]);
      exit();
    }
  });

  return (
    <Box flexDirection="column">
      {environments.map((env, i) => (
        <Box key={env.domain}>
          <Text color={i === selectedIndex ? 'cyan' : undefined}>
            {i === selectedIndex ? '❯ ' : '  '}
            {env.domain}
            <Text dimColor> ({env.env.database?.name || 'no db'})</Text>
          </Text>
        </Box>
      ))}
      <Text dimColor>
        {'\n'}↑↓ to navigate, Enter to select, Esc to cancel
      </Text>
    </Box>
  );
};

/**
 * Select a local environment (returns the only one or prompts for selection)
 */
export async function selectLocalEnvironment(
  config: SiteConfig
): Promise<{ domain: string; env: EnvironmentConfig } | null> {
  const locals = getLocalEnvironments(config);

  if (locals.length === 0) {
    console.error('❌ No local environment configured. Please add one with: move-site config');
    return null;
  }

  if (locals.length === 1) {
    return locals[0];
  }

  // Multiple local environments - show selector
  return new Promise((resolve) => {
    console.log('\n📍 Multiple local environments found. Select source:');
    render(
      React.createElement(EnvironmentSelector, {
        environments: locals,
        onSelect: (selected) => resolve(selected),
        onCancel: () => resolve(null),
      })
    );
  });
}

/**
 * Build connection arguments for mysql/mysqldump
 */
function buildMysqlConnectionArgs(db: EnvironmentConfig['database']): string {
  let args = '';
  
  // Use socket if available, otherwise host
  if (db.socket) {
    args += ` --socket="${db.socket}"`;
  } else {
    args += ` -h "${db.host}"`;
    if (db.port) {
      args += ` -P ${db.port}`;
    }
  }
  
  args += ` -u "${db.user}"`;
  if (db.password) {
    args += ` -p"${db.password}"`;
  }
  
  return args;
}

/**
 * Wrap command with Local app environment if configured
 */
function wrapWithLocalEnv(cmd: string, localApp?: EnvironmentConfig['localApp']): string {
  if (!localApp?.shellScript) {
    return cmd;
  }
  
  // Source the shell script to get environment variables, then run the command
  // We use bash -c to run in a subshell that sources the env setup
  const shellScript = localApp.shellScript;
  
  // Extract just the environment setup (PATH and MYSQL_HOME) without the interactive shell parts
  return `bash -c 'source <(grep -E "^export (PATH|MYSQL_HOME)=" "${shellScript}") && ${cmd.replace(/'/g, "'\"'\"'")}'`;
}

/**
 * Dump local database to a file
 */
export async function dumpLocalDatabase(
  localEnv: EnvironmentConfig,
  outputPath: string
): Promise<{ success: boolean; error?: string }> {
  const db = localEnv.database;
  if (!db) {
    return { success: false, error: 'No database configuration found' };
  }

  const tablePrefix = db.tablePrefix || 'wp_';
  const localApp = localEnv.localApp;

  try {
    const connArgs = buildMysqlConnectionArgs(db);
    
    // Determine mysql/mysqldump commands (use custom paths if provided)
    const mysqlBin = localApp?.mysqlPath || 'mysql';
    const mysqldumpBin = localApp?.mysqldumpPath || 'mysqldump';

    // Get tables with prefix if specified
    let tables: string[] = [];
    if (tablePrefix) {
      const getTablesCmd = wrapWithLocalEnv(
        `${mysqlBin}${connArgs} -N -e "SHOW TABLES LIKE '${tablePrefix}%'" "${db.name}"`,
        localApp
      );
      
      const { stdout } = await execAsync(getTablesCmd);
      tables = stdout.trim().split('\n').filter((t) => t);

      if (tables.length === 0) {
        return { success: false, error: `No tables found with prefix '${tablePrefix}'` };
      }
    }

    // Build mysqldump command
    let dumpCmd = `${mysqldumpBin}${connArgs} "${db.name}"`;
    if (tables.length > 0) {
      dumpCmd += ` ${tables.join(' ')}`;
    }
    dumpCmd += ` > "${outputPath}"`;

    // Wrap with local environment if needed
    const finalCmd = wrapWithLocalEnv(dumpCmd, localApp);
    
    await execAsync(finalCmd);
    return { success: true };
  } catch (error) {
    const err = error as Error;
    return { success: false, error: err.message };
  }
}

/**
 * Upload database from local to remote environment
 */
export async function uploadDatabase(
  sourceEnv: { domain: string; env: EnvironmentConfig },
  targetEnv: { domain: string; env: EnvironmentConfig },
  config: SiteConfig,
  options: { dryRun?: boolean; skipBackup?: boolean } = {}
): Promise<void> {
  const sourceDb = sourceEnv.env.database;
  const targetDb = targetEnv.env.database;

  if (!sourceDb) {
    console.error('❌ Source environment has no database configuration');
    process.exit(1);
  }

  if (!targetDb) {
    console.error('❌ Target environment has no database configuration');
    process.exit(1);
  }

  if (!targetEnv.env.ssh) {
    console.error('❌ Target environment has no SSH configuration');
    process.exit(1);
  }

  const sourceUrl = sourceEnv.env.url;
  const targetUrl = targetEnv.env.url;
  const tablePrefix = targetDb.tablePrefix || sourceDb.tablePrefix || 'wp_';

  console.log(`\n🗄️  Database Upload: ${sourceEnv.domain} → ${targetEnv.domain}`);
  console.log(`   Source URL: ${sourceUrl}`);
  console.log(`   Target URL: ${targetUrl}`);
  console.log(`   Table prefix: ${tablePrefix}`);

  if (options.dryRun) {
    console.log('\n🔍 Dry run - would perform:');
    console.log('   1. Backup target database on remote server');
    console.log('   2. Dump local database');
    console.log('   3. Upload dump to remote server');
    console.log('   4. Import dump on remote server');
    console.log('   5. Replace URLs in database:');
    console.log(`      ${sourceUrl} → ${targetUrl}`);
    return;
  }

  const transfer = new SSHTransfer(targetEnv.env);
  const tempDir = os.tmpdir();
  const timestamp = Date.now();
  const localDumpPath = path.join(tempDir, `move-site-db-${timestamp}.sql`);

  try {
    await transfer.connect();
    console.log(`\n🔌 Connected to ${targetEnv.env.ssh.host}`);

    // Step 1: Backup target database
    if (!options.skipBackup) {
      console.log('\n💾 Step 1: Backing up target database...');
      const backupsDir = `${targetEnv.env.remotePath}/backups`;
      await transfer.exec(`mkdir -p "${backupsDir}"`);

      const backupName = `${new Date().toISOString().slice(0, 10)}-${new Date().toISOString().slice(11, 16).replace(':', '-')}-database-pre-upload.tar.gz`;
      const sqlFile = `${backupsDir}/database.sql`;
      const backupPath = `${backupsDir}/${backupName}`;

      let mysqldumpCmd = `mysqldump -h "${targetDb.host}" -u "${targetDb.user}" -p"${targetDb.password}" "${targetDb.name}"`;

      // Get tables with prefix
      if (tablePrefix) {
        const getTablesCmd = `mysql -h "${targetDb.host}" -u "${targetDb.user}" -p"${targetDb.password}" -N -e "SHOW TABLES LIKE '${tablePrefix}%'" "${targetDb.name}"`;
        const tablesResult = await transfer.exec(getTablesCmd);
        if (tablesResult.code === 0) {
          const tables = tablesResult.stdout.trim().split('\n').filter((t) => t);
          if (tables.length > 0) {
            mysqldumpCmd = `mysqldump -h "${targetDb.host}" -u "${targetDb.user}" -p"${targetDb.password}" "${targetDb.name}" ${tables.join(' ')}`;
          }
        }
      }

      const dumpCmd = `${mysqldumpCmd} > "${sqlFile}" && tar -czf "${backupPath}" -C "${backupsDir}" database.sql && rm "${sqlFile}"`;
      const backupResult = await transfer.exec(dumpCmd);

      if (backupResult.code !== 0) {
        console.error(`   ⚠️  Backup failed: ${backupResult.stderr}`);
        console.log('   Continuing anyway...');
      } else {
        console.log(`   ✅ Backup created: backups/${backupName}`);
      }
    } else {
      console.log('\n⚠️  Step 1: Skipping backup (--no-backup flag)');
    }

    // Step 2: Dump local database
    console.log('\n📤 Step 2: Dumping local database...');
    const dumpResult = await dumpLocalDatabase(sourceEnv.env, localDumpPath);

    if (!dumpResult.success) {
      console.error(`   ❌ Failed to dump local database: ${dumpResult.error}`);
      process.exit(1);
    }

    const dumpStat = await fs.stat(localDumpPath);
    const sizeMB = (dumpStat.size / (1024 * 1024)).toFixed(2);
    console.log(`   ✅ Local database dumped (${sizeMB} MB)`);

    // Step 3: Upload dump to remote
    console.log('\n📤 Step 3: Uploading database dump...');
    const remoteDumpPath = `${targetEnv.env.remotePath}/backups/upload-${timestamp}.sql`;
    await transfer.uploadFile(localDumpPath, remoteDumpPath);
    console.log('   ✅ Dump uploaded');

    // Step 4: Import on remote
    console.log('\n📥 Step 4: Importing database on remote...');
    const importCmd = `mysql -h "${targetDb.host}" -u "${targetDb.user}" -p"${targetDb.password}" "${targetDb.name}" < "${remoteDumpPath}"`;
    const importResult = await transfer.exec(importCmd);

    if (importResult.code !== 0) {
      console.error(`   ❌ Import failed: ${importResult.stderr}`);
      // Clean up
      await transfer.exec(`rm -f "${remoteDumpPath}"`);
      await fs.unlink(localDumpPath).catch(() => {});
      process.exit(1);
    }
    console.log('   ✅ Database imported');

    // Step 5: Replace URLs
    console.log('\n🔄 Step 5: Replacing URLs in database...');
    console.log(`   ${sourceUrl} → ${targetUrl}`);

    const queries = WP_URL_REPLACE_QUERIES(tablePrefix, sourceUrl, targetUrl);
    let successCount = 0;

    for (const query of queries) {
      const mysqlCmd = `mysql -h "${targetDb.host}" -u "${targetDb.user}" -p"${targetDb.password}" "${targetDb.name}" -e "${query}"`;
      const result = await transfer.exec(mysqlCmd);
      if (result.code === 0) {
        successCount++;
      }
    }

    console.log(`   ✅ Updated ${successCount}/${queries.length} tables`);

    // Clean up remote dump
    await transfer.exec(`rm -f "${remoteDumpPath}"`);
    
    // Clean up local dump
    await fs.unlink(localDumpPath).catch(() => {});

    console.log('\n✅ Database upload complete!');
  } catch (error) {
    const err = error as Error;
    console.error(`\n❌ Database upload failed: ${err.message}`);
    // Clean up on error
    await fs.unlink(localDumpPath).catch(() => {});
    process.exit(1);
  } finally {
    await transfer.disconnect();
  }
}

/**
 * Update wp-config.php on remote server with correct database settings
 */
export async function updateWpConfig(
  targetEnv: { domain: string; env: EnvironmentConfig },
  sourceUrl: string
): Promise<{ success: boolean; error?: string }> {
  if (!targetEnv.env.ssh) {
    return { success: false, error: 'No SSH configuration' };
  }

  const transfer = new SSHTransfer(targetEnv.env);
  const wpConfigPath = `${targetEnv.env.remotePath}/wp-config.php`;
  const db = targetEnv.env.database;
  const targetUrl = targetEnv.env.url;

  if (!db) {
    return { success: false, error: 'No database configuration' };
  }

  try {
    await transfer.connect();

    // Check if wp-config.php exists
    const checkResult = await transfer.exec(`test -f "${wpConfigPath}" && echo "exists"`);
    if (!checkResult.stdout.includes('exists')) {
      return { success: false, error: 'wp-config.php not found' };
    }

    // Update database settings using sed
    const updates = [
      // Update DB_NAME
      `sed -i "s/define([[:space:]]*'DB_NAME'[[:space:]]*,[[:space:]]*'[^']*'/define('DB_NAME', '${db.name}'/" "${wpConfigPath}"`,
      // Update DB_USER
      `sed -i "s/define([[:space:]]*'DB_USER'[[:space:]]*,[[:space:]]*'[^']*'/define('DB_USER', '${db.user}'/" "${wpConfigPath}"`,
      // Update DB_PASSWORD
      `sed -i "s/define([[:space:]]*'DB_PASSWORD'[[:space:]]*,[[:space:]]*'[^']*'/define('DB_PASSWORD', '${db.password}'/" "${wpConfigPath}"`,
      // Update DB_HOST
      `sed -i "s/define([[:space:]]*'DB_HOST'[[:space:]]*,[[:space:]]*'[^']*'/define('DB_HOST', '${db.host}'/" "${wpConfigPath}"`,
    ];

    // Update table prefix if different
    if (db.tablePrefix) {
      updates.push(
        `sed -i "s/\\$table_prefix[[:space:]]*=[[:space:]]*'[^']*'/\\$table_prefix = '${db.tablePrefix}'/" "${wpConfigPath}"`
      );
    }

    // Update WP_HOME and WP_SITEURL if they exist (replace source URL with target URL)
    updates.push(
      `sed -i "s|${sourceUrl}|${targetUrl}|g" "${wpConfigPath}"`
    );

    for (const cmd of updates) {
      const result = await transfer.exec(cmd);
      if (result.code !== 0) {
        console.log(`   ⚠️  Warning: ${result.stderr}`);
      }
    }

    return { success: true };
  } catch (error) {
    const err = error as Error;
    return { success: false, error: err.message };
  } finally {
    await transfer.disconnect();
  }
}
