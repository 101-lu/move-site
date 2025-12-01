# Upload Command

The `upload` command transfers files from your local WordPress installation to a remote environment. It uses archive-based transfers (tar.gz) for fast and efficient uploads.

---

## Basic Usage

```bash
move-site upload <environment> [options]
```

### Examples

```bash
# Upload themes to test environment
move-site upload test --themes

# Upload plugins and uploads to production
move-site upload production --plugins --uploads

# Upload everything
move-site upload test --all

# Preview what would be uploaded (dry run)
move-site upload test --themes --dry-run
```

---

## Options

| Option | Description |
|--------|-------------|
| `--all` | Upload all WordPress files |
| `--themes` | Upload `wp-content/themes` folder |
| `--plugins` | Upload `wp-content/plugins` folder |
| `--uploads` | Upload `wp-content/uploads` folder |
| `--core` | Upload WordPress core files (`wp-admin`, `wp-includes`, root PHP files) |
| `--database` | Export and upload the database (not yet implemented) |
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
move-site upload test --themes --no-backup
```

### 3. Create Local Archive
Files are compressed into a tar.gz archive locally. This is much faster than uploading thousands of individual files.

### 4. Upload Archive
The single archive file is uploaded to the remote server via SFTP.

### 5. Extract on Server
The archive is extracted on the remote server, replacing existing files.

### 6. Set File Ownership
If `filesOwner` is configured, ownership is updated for all uploaded files.

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
move-site upload test --plugins --dry-run
```

Output:
```
📤 Uploading to test...
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
move-site upload test --plugins --dry-run --verbose
```

---

## Upload Workflow Example

### Scenario: Deploy theme changes to staging

```bash
# 1. Preview what will be uploaded
move-site upload test --themes --dry-run

# 2. Upload with backup (default)
move-site upload test --themes

# 3. Or skip backup if you're confident
move-site upload test --themes --no-backup
```

### Output

```
📤 Uploading to test...

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
