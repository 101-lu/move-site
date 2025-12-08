# Upload Command

The `upload` command transfers files from your local WordPress installation to a remote environment. It uses archive-based transfers (tar.gz) for fast and efficient uploads.

---

## Basic Usage

```bash
move-site upload <environment> [options]
```

The `<environment>` can be specified in multiple ways:
- **Exact domain**: `move-site upload staging.example.com --themes`
- **Environment type**: `move-site upload production --themes` (if only one production environment exists)
- **Partial match**: `move-site upload staging --themes` (matches `staging.example.com`)

If multiple environments match, you'll get an interactive selector to choose from.

### Examples

```bash
# Using full domain
move-site upload staging.example.com --themes

# Using environment type (if unique)
move-site upload production --plugins --uploads

# Using partial match
move-site upload staging --all

# Upload only database (with URL replacement)
move-site upload test --database

# Preview what would be uploaded (dry run)
move-site upload prod --themes --dry-run

# Upload files and database, skip backup
move-site upload staging --all --no-backup
```

---

## Options

| Option | Description |
|--------|-------------|
| `--all` | Upload all files, database, and update wp-config.php |
| `--themes` | Upload `wp-content/themes` folder |
| `--plugins` | Upload `wp-content/plugins` folder |
| `--uploads` | Upload `wp-content/uploads` folder |
| `--core` | Upload WordPress core files (`wp-admin`, `wp-includes`, root PHP files) |
| `--database` | Export local database, upload and import on remote, replace URLs |
| `--dry-run` | Show what would be uploaded without uploading |
| `--verbose` | Show all files in dry-run mode (instead of first 5) |
| `--no-backup` | Skip creating a backup before upload |

---

## How It Works

### 1. Scan Files
Move Site scans your local WordPress directory based on the options you specify.

### 2. Create Backup (Optional)
By default, a backup is created on the remote server before uploading. This provides a safety net in case something goes wrong.

```bash
# Skip backup when you're confident
move-site upload staging.example.com --themes --no-backup
```

### 3. Create Local Archive
Files are compressed into a tar.gz archive locally. This is much faster than uploading thousands of individual files.

### 4. Upload Archive
The single archive file is uploaded to the remote server via SFTP.

### 5. Extract on Server
The archive is extracted on the remote server, replacing existing files.

### 6. Set File Ownership
If `filesOwner` is configured, ownership is updated for all uploaded files.

### 7. Database Upload (if --database or --all)
When using `--database` or `--all`:

1. **Select local environment** - If multiple local environments exist, you'll be prompted to select one
2. **Backup remote database** - Creates a backup on the target server before making changes
3. **Dump local database** - Exports the local database using mysqldump
4. **Upload to remote** - Transfers the dump file via SFTP
5. **Import on remote** - Imports the database on the target server
6. **Replace URLs** - Updates WordPress URLs in the database:
   - `wp_options` (home, siteurl)
   - `wp_posts` (guid, post_content)
   - `wp_postmeta` (meta_value)
   - `wp_comments` (comment_content, comment_author_url)
   - `wp_termmeta` (meta_value)

### 8. Update wp-config.php (if --all)
When using `--all`, the remote wp-config.php is updated with:
- Correct database credentials (DB_NAME, DB_USER, DB_PASSWORD, DB_HOST)
- Updated table prefix if different
- URL replacements (WP_HOME, WP_SITEURL if defined)

---

## Excluded Files

The following files and folders are automatically excluded from uploads:

| Category | Patterns |
|----------|----------|
| **Dependencies** | `node_modules`, `vendor` |
| **Version Control** | `.git`, `.gitignore`, `.svn` |
| **IDE/Editor** | `.idea`, `.vscode`, `*.swp` |
| **OS Files** | `.DS_Store`, `Thumbs.db`, `desktop.ini` |
| **Environment** | `.env`, `.env.local`, `.env.production` |
| **Logs** | `*.log`, `debug.log`, `error_log` |
| **App Specific** | `.move-site-config.json`, `backups` |

---

## Dry Run Mode

Use `--dry-run` to preview what would be uploaded without making any changes:

```bash
move-site upload staging.example.com --plugins --dry-run
```

Output:
```
📤 Uploading to staging.example.com...
📦 WordPress version: 6.4.2
🔍 Scanning files...
📁 Found 1247 files to upload

🔍 Dry run - files that would be uploaded:

  Plugins: 1247 files
    - wp-content/plugins/akismet/akismet.php
    - wp-content/plugins/akismet/class.akismet.php
    - wp-content/plugins/akismet/class.akismet-admin.php
    - wp-content/plugins/akismet/class.akismet-cli.php
    - wp-content/plugins/akismet/class.akismet-rest-api.php
    ... and 1242 more
```

Add `--verbose` to see all files:

```bash
move-site upload staging.example.com --plugins --dry-run --verbose
```

---

## Upload Workflow Example

### Scenario: Deploy theme changes to staging

```bash
# 1. Preview what will be uploaded
move-site upload staging.example.com --themes --dry-run

# 2. Upload with backup (default)
move-site upload staging.example.com --themes

# 3. Or skip backup if you're confident
move-site upload staging.example.com --themes --no-backup
```

### Output

```
📤 Uploading to staging.example.com...

📦 WordPress version: 6.4.2
🔍 Scanning files...
📁 Found 342 files to upload

💾 Creating backup before upload...
🔌 Connecting to staging.example.com...
✅ Connected!

📁 Ensuring backups directory exists...

⏳ Backing up themes...
   ✅ Created: backups/2025-12-01-15-30-themes.tar.gz (2.4M)

✅ Backup complete!

🔌 Connecting to staging.example.com...
✅ Connected!

📦 Creating local archive...
   ✅ Archive created: 1.85 MB

📤 Uploading archive...
   ✅ Archive uploaded

📂 Extracting on server...
   ✅ Files extracted

✅ Upload complete! (342 files)

🔧 Setting file ownership to 'www-data:www-data'...
   ✅ Ownership updated
```

---

## Download for Local Import (WP Migrate Local)

Use the `download` command to create a WP Migrate Local compatible archive and download it to your local machine. You can choose to create a full site archive with `--full`, or just the WP Migrate Local format (a root `backup.sql` + `wp-content`).

```bash
# Download WP Migrate Local archive (wp-content + backup.sql)
move-site download staging.example.com -o ./local-imports

# Download a full site archive (all files)
move-site download staging.example.com --full -o ./local-imports
```

Notes:
- The command requires SSH access to the remote environment.
- If `zip` is available on the remote server, the archive will be created as a zip file; otherwise, a tar.gz fallback is used.
- The downloaded archive will be placed in the specified output folder (defaults to the current folder).


---

## File Permissions

Uploaded files are set to `644` (`-rw-r--r--`) to prevent 403 Forbidden errors on web servers. Directories maintain their default permissions from the tar extraction.

---

## Troubleshooting

### 403 Forbidden After Upload

This was a known issue where files were uploaded with `666` permissions. Now fixed — files are set to `644` after upload.

If you still have issues, run on the server:
```bash
find /path/to/site -type f -exec chmod 644 {} \;
find /path/to/site -type d -exec chmod 755 {} \;
```

### Upload Takes Too Long

The archive-based upload should be fast. If still slow:
- Check your internet connection
- Ensure large unnecessary folders are excluded (node_modules, etc.)
- Consider using `--themes` or `--plugins` instead of `--all`

### Permission Denied on chown

If you see "Could not change ownership (may require sudo)", your SSH user doesn't have permission to change file ownership. Options:
- Ask your hosting provider to set up proper permissions
- Remove `filesOwner` from config if ownership isn't needed
- Configure sudoers on the server (advanced)

---

© 2025 101 Studios
