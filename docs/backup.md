# Backup Command

The `backup` command manages backups on remote environments. You can create, list, download, delete, and restore backups of both files and databases.

---

## Command Structure

```bash
move-site backup <subcommand> <environment> [options]
```

### Available Subcommands

| Subcommand | Description |
|------------|-------------|
| `create` | Create a new backup on the remote server |
| `list` | List existing backups |
| `download` | Download backups to local machine |
| `delete` | Delete backups from remote server |
| `restore` | Restore files or database from a backup |

---

## Create Backups

Create backups of files or database on the remote server.

```bash
move-site backup create <environment> [options]
```

### Options

| Option | Description |
|--------|-------------|
| `--all` | Backup all files (excluding backups folder) |
| `--themes` | Backup `wp-content/themes` |
| `--plugins` | Backup `wp-content/plugins` |
| `--uploads` | Backup `wp-content/uploads` |
| `--core` | Backup WordPress core files |
| `--database` | Backup the database (mysqldump) |
| `--dry-run` | Show what would be backed up |

### Examples

```bash
# Backup themes
move-site backup create test --themes

# Backup database only
move-site backup create production --database

# Backup themes and plugins together
move-site backup create test --themes --plugins

# Backup everything (files only)
move-site backup create test --all

# Preview what would be backed up
move-site backup create test --database --dry-run
```

### Output

```
📦 Creating backup on test...

🔌 Connecting to staging.example.com...
✅ Connected!

📁 Ensuring backups directory exists...

⏳ Backing up themes...
   ✅ Created: backups/2025-12-01-15-30-themes.tar.gz (2.4M)

✅ Backup complete!
```

### Backup Naming Convention

Backups are named with timestamp and type:
```
YYYY-MM-DD-HH-mm-<type>.tar.gz
```

Examples:
- `2025-12-01-15-30-themes.tar.gz`
- `2025-12-01-15-30-plugins.tar.gz`
- `2025-12-01-15-30-database.tar.gz`
- `2025-12-01-15-30-all.tar.gz`

---

## List Backups

View all backups on a remote environment.

```bash
move-site backup list <environment>
```

### Example

```bash
move-site backup list test
```

### Output

```
📋 Listing backups on test...

   Found 5 backup(s):

   📦 2025-12-01-15-30-themes.tar.gz (2.4M)
   📦 2025-12-01-14-20-plugins.tar.gz (8.1M)
   📦 2025-12-01-14-20-database.tar.gz (156K)
   📦 2025-11-30-10-00-all.tar.gz (45M)
   📦 2025-11-29-16-45-uploads.tar.gz (120M)
```

---

## Download Backups

Download backups from remote server to your local machine.

```bash
move-site backup download <environment> [options]
```

### Options

| Option | Description |
|--------|-------------|
| `--all` | Download all backups without selection |
| `-o, --output <path>` | Local directory to save backups (default: `./backups`) |

### Examples

```bash
# Interactive selection
move-site backup download test

# Download all backups
move-site backup download test --all

# Specify output directory
move-site backup download test -o ~/Desktop/site-backups
```

### Interactive Selection

When run without `--all`, an interactive selector appears:

```
📥 Download backups from test...

🔌 Connecting to staging.example.com...
✅ Connected!

Select backups to download (Space to select, Enter to confirm):

  ○ 2025-12-01-15-30-themes.tar.gz (2.4M)
  ● 2025-12-01-14-20-plugins.tar.gz (8.1M)
  ● 2025-12-01-14-20-database.tar.gz (156K)
  ○ 2025-11-30-10-00-all.tar.gz (45M)
```

---

## Delete Backups

Remove backups from the remote server.

```bash
move-site backup delete <environment> [options]
```

### Options

| Option | Description |
|--------|-------------|
| `--all` | Delete all backups (with confirmation) |

### Examples

```bash
# Interactive selection
move-site backup delete test

# Delete all backups
move-site backup delete test --all
```

### Interactive Selection

```
🗑️  Delete backups on test...

Select backups to delete (Space to select, Enter to confirm):

  ○ 2025-12-01-15-30-themes.tar.gz (2.4M)
  ● 2025-11-30-10-00-all.tar.gz (45M)
  ● 2025-11-29-16-45-uploads.tar.gz (120M)
```

---

## Restore Backups

Restore files or database from a backup.

```bash
move-site backup restore <environment> [options]
```

### Options

| Option | Description |
|--------|-------------|
| `--dry-run` | Show what would be restored without restoring |

### Examples

```bash
# Interactive selection and restore
move-site backup restore test

# Preview restore
move-site backup restore test --dry-run
```

### Restore Workflow

1. Select a backup from the interactive list
2. Confirm the restore operation
3. Files are extracted or database is imported

### File Restore

```
🔄 Restore backup on test...

🔌 Connecting to staging.example.com...
✅ Connected!

Select backup to restore:

  ○ 2025-12-01-15-30-themes.tar.gz (2.4M)
  ● 2025-12-01-14-20-plugins.tar.gz (8.1M)

⚠️  This will overwrite existing files!
   Backup: 2025-12-01-14-20-plugins.tar.gz (8.1M)
   Target: /var/www/html/mysite

Are you sure you want to restore this backup? (yes/no): yes

🔄 Restoring backup...

✅ Restored successfully from: 2025-12-01-14-20-plugins.tar.gz

🔧 Setting file ownership to 'www-data:www-data'...
   ✅ Ownership updated
```

### Database Restore

Database backups are detected by the `-database` in the filename:

```
🔄 Restore backup on test...

Select backup to restore:

  ● 2025-12-01-14-20-database.tar.gz (156K)

⚠️  This will replace tables in the database!
   Backup: 2025-12-01-14-20-database.tar.gz (156K)
   Database: mysite_staging

Are you sure you want to restore this backup? (yes/no): yes

🔄 Restoring backup...

✅ Database restored successfully from: 2025-12-01-14-20-database.tar.gz
```

---

## Database Backups

### How Database Backup Works

1. Runs `mysqldump` on the remote server
2. If table prefix is configured, only backs up tables with that prefix
3. Creates `database.sql` file
4. Compresses into `.tar.gz` archive
5. Cleans up the temporary SQL file

### Table Prefix Filtering

If you have `tablePrefix: "wp_"` in your config, the backup will only include tables starting with `wp_`:

```
⏳ Backing up database...
   📋 Found 12 tables with prefix 'wp_'
   ✅ Created: backups/2025-12-01-15-30-database.tar.gz (156K)
```

This is useful when multiple WordPress installations share the same database.

---

## Backup Storage Location

All backups are stored in a `backups` folder within your remote path:

```
/var/www/html/mysite/
├── wp-admin/
├── wp-content/
├── wp-includes/
├── backups/                          ← Backup storage
│   ├── 2025-12-01-15-30-themes.tar.gz
│   ├── 2025-12-01-14-20-database.tar.gz
│   └── ...
└── ...
```

---

## Automatic Backups

The `upload` command creates backups automatically before uploading. To skip:

```bash
move-site upload test --themes --no-backup
```

---

## Best Practices

1. **Regular backups**: Create database backups before major changes
2. **Download important backups**: Don't rely solely on server-side storage
3. **Clean old backups**: Periodically delete old backups to save disk space
4. **Test restores**: Occasionally test restore on a staging environment

---

© 2025 101 Studios
