# Database Operations

Move Site supports database backup and restore operations for WordPress sites. This document covers the database-related workflows.

---

## Overview

Database operations run on the **remote server** using MySQL command-line tools (`mysqldump` and `mysql`). Your remote server must have these tools installed and accessible.

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
move-site backup create production --database
```

### Output

```
📦 Creating backup on production...

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
move-site backup restore test
```

### Interactive Selection

```
🔄 Restore backup on test...

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
move-site backup create test --database --dry-run

# Preview restore
move-site backup restore test --dry-run
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
move-site backup create production --database

# Download to local machine
move-site backup download production
```

### Workflow 2: Sync Database to Staging

```bash
# 1. Backup production database
move-site backup create production --database

# 2. Download the backup
move-site backup download production -o ./temp-backups

# 3. Upload backup to staging server manually or restore from production backup
```

### Workflow 3: Restore After Failed Deployment

```bash
# 1. List available backups
move-site backup list test

# 2. Restore the database
move-site backup restore test
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

1. **No search-replace**: URLs are not automatically updated when moving between environments
2. **Full table restore**: Individual tables cannot be selected
3. **No incremental backups**: Each backup is a full database dump
4. **Remote only**: Database operations run on remote server, not local

---

## Future Enhancements

Planned features for database operations:

- [ ] Search-replace for URLs during migration
- [ ] Selective table backup/restore
- [ ] Local database operations
- [ ] Database comparison between environments

---

© 2025 101 Studios
