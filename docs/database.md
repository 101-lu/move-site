# Database Operations

Move Site supports database backup and restore operations for WordPress sites. This document covers the database-related workflows.

---

## Overview

Database operations include:
- **Backup**: Create database dumps on remote servers
- **Restore**: Restore database backups on remote servers
- **Upload**: Migrate local database to remote with automatic URL replacement

---

## Database Configuration

Database settings are part of each environment configuration:

```json
{
  "database": {
    "host": "localhost",
    "port": 3306,
    "name": "mysite_db",
    "user": "db_user",
    "password": "db_password",
    "tablePrefix": "wp_"
  }
}
```

### Configuration Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `host` | string | Yes | - | Database server hostname |
| `port` | number | No | 3306 | Database server port |
| `name` | string | Yes | - | Database name |
| `user` | string | Yes | - | Database username |
| `password` | string | Yes | - | Database password |
| `tablePrefix` | string | No | `wp_` | WordPress table prefix |

---

## Database Backup

### Create a Database Backup

```bash
move-site backup create <environment> --database
```

### Example

```bash
move-site backup create example.com --database
```

### Output

```
📦 Creating backup on example.com...

🔌 Connecting to example.com...
✅ Connected!

📁 Ensuring backups directory exists...

⏳ Backing up database...
   📋 Found 12 tables with prefix 'wp_'
   ✅ Created: backups/2025-12-01-15-30-database.tar.gz (156K)

✅ Backup complete!
```

### What Happens

1. **Connect** to remote server via SSH
2. **Run mysqldump** with configured credentials
3. **Filter tables** by prefix (if configured)
4. **Create SQL file** with database dump
5. **Compress** into tar.gz archive
6. **Clean up** temporary SQL file

### Table Prefix Filtering

When `tablePrefix` is configured, only tables with that prefix are backed up:

```sql
-- Only these tables are included:
wp_options
wp_posts
wp_postmeta
wp_users
wp_usermeta
wp_comments
wp_commentmeta
wp_terms
wp_termmeta
wp_term_relationships
wp_term_taxonomy
wp_links
```

This is useful when:
- Multiple WordPress sites share one database
- You want to exclude non-WordPress tables
- You have custom tables without the prefix

---

## Database Restore

### Restore from Backup

```bash
move-site backup restore <environment>
```

Then select a database backup (files containing `-database.` in the name).

### Example

```bash
move-site backup restore staging.example.com
```

### Interactive Selection

```
🔄 Restore backup on staging.example.com...

🔌 Connecting to staging.example.com...
✅ Connected!

Select backup to restore:

  ○ 2025-12-01-15-30-themes.tar.gz (2.4M)
  ○ 2025-12-01-14-20-plugins.tar.gz (8.1M)
  ● 2025-12-01-14-20-database.tar.gz (156K)    ← Database backup
```

### Confirmation

```
⚠️  This will replace tables in the database!
   Backup: 2025-12-01-14-20-database.tar.gz (156K)
   Database: mysite_staging

Are you sure you want to restore this backup? (yes/no): yes

🔄 Restoring backup...

✅ Database restored successfully from: 2025-12-01-14-20-database.tar.gz
```

### What Happens

1. **Extract** SQL file from archive to temp directory
2. **Import** SQL using `mysql` command
3. **Clean up** temporary files

---

## Dry Run

Preview database operations without making changes:

```bash
# Preview backup
move-site backup create staging.example.com --database --dry-run

# Preview restore
move-site backup restore staging.example.com --dry-run
```

### Dry Run Output

```
🔍 Dry run - would create backups for:
   🗄️  database → backups/2025-12-01-15-30-database.tar.gz
```

---

## Common Workflows

### Workflow 1: Backup Production Database

```bash
# Create backup on production
move-site backup create example.com --database

# Download to local machine
move-site backup download example.com
```

### Workflow 2: Sync Database to Staging

```bash
# 1. Backup production database
move-site backup create example.com --database

# 2. Download the backup
move-site backup download example.com -o ./temp-backups

# 3. Upload backup to staging server manually or restore from production backup
```

### Workflow 3: Restore After Failed Deployment

```bash
# 1. List available backups
move-site backup list staging.example.com

# 2. Restore the database
move-site backup restore staging.example.com
# Select the database backup from the list
```

---

## Backup File Structure

Database backups contain a single `database.sql` file:

```
2025-12-01-15-30-database.tar.gz
└── database.sql
```

The SQL file includes:
- Table structures (`CREATE TABLE`)
- Table data (`INSERT INTO`)
- Indexes and constraints

---

## Troubleshooting

### "mysqldump: command not found"

The remote server doesn't have MySQL client tools installed. Contact your hosting provider or install:

```bash
# Ubuntu/Debian
apt-get install mysql-client

# CentOS/RHEL
yum install mysql
```

### "Access denied for user"

Check your database credentials in the configuration:

```json
{
  "database": {
    "host": "localhost",
    "name": "correct_database",
    "user": "correct_user",
    "password": "correct_password"
  }
}
```

### "No tables found with prefix"

The table prefix might be wrong. Check your `wp-config.php`:

```php
$table_prefix = 'wp_';  // Use this value
```

### Large Database Backups

For very large databases:
- Backups may take longer to create
- Downloads may be slow
- Consider backing up during low-traffic periods

---

## Security Considerations

⚠️ **Database credentials are stored in plain text** in the configuration file.

- Never commit `.move-site-config.json` to version control
- Use strong, unique passwords for each environment
- Limit database user permissions to only necessary operations
- Consider using SSH tunnels for additional security

---

## Limitations

Current limitations of database operations:

1. **Full table restore**: Individual tables cannot be selected during restore
2. **No incremental backups**: Each backup is a full database dump

---

## Database Upload

Upload your local database to a remote environment with automatic URL replacement.

### Usage

```bash
# Upload database only
move-site upload <target-environment> --database

# Upload files and database together
move-site upload <target-environment> --all
```

### Example

```bash
move-site upload staging.example.com --database
```

### What Happens

1. **Select source**: Choose which local environment to upload from
2. **Backup target**: Automatically backs up the target database first
3. **Dump local**: Creates a dump of your local database
4. **Upload**: Transfers the SQL file to the remote server
5. **Restore**: Imports the SQL into the target database
6. **URL replacement**: Updates all WordPress URLs from source to target domain
7. **wp-config update** (with `--all`): Updates `WP_HOME` and `WP_SITEURL` constants

### URL Replacement

When migrating databases, Move Site automatically updates URLs in these WordPress tables:

| Table | Fields |
|-------|--------|
| `wp_options` | `option_value` (for `home`, `siteurl`) |
| `wp_posts` | `guid`, `post_content` |
| `wp_postmeta` | `meta_value` |
| `wp_comments` | `comment_content`, `comment_author_url` |
| `wp_termmeta` | `meta_value` |

URLs are replaced from the source environment's URL to the target environment's URL as configured in your `.move-site-config.json`.

### wp-config.php Updates

When using `--all`, Move Site also updates these constants in `wp-config.php`:

```php
define('WP_HOME', 'https://target-domain.com');
define('WP_SITEURL', 'https://target-domain.com');
```

---

## Local App (Flywheel) Support

If you use [Local](https://localwp.com/) by Flywheel, Move Site can connect to your Local databases using the app's shell script environment.

### Configuration

```json
{
  "mysite.local": {
    "type": "local",
    "url": "https://mysite.local",
    "remotePath": "~/Local Sites/mysite/app/public",
    "database": {
      "host": "localhost",
      "port": 10003,
      "name": "local",
      "user": "root",
      "password": "root",
      "tablePrefix": "wp_",
      "socket": "~/Library/Application Support/Local/run/[SITE_ID]/mysql/mysqld.sock"
    },
    "localApp": {
      "shellScript": "~/Library/Application Support/Local/ssh-entry/[SITE_ID].sh"
    }
  }
}
```

See the [Configuration Guide](./configuration.md#local-app-flywheel-environment) for details on finding your Local site ID.

---

## Future Enhancements

Planned features for database operations:

- [ ] Selective table backup/restore
- [ ] Database comparison between environments

---

© 2025 101 Studios
