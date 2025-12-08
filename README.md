# Move Site

CLI tool for moving WordPress sites between environments (local, staging, production). Transfer files and databases with automatic URL replacement.

## Features

- 📁 **File Transfer** - Upload files via SSH/SFTP using efficient tar.gz archives
- 🗄️ **Database Migration** - Export, upload, and import databases with automatic URL replacement
- 🔧 **Interactive Wizard** - Easy configuration setup
- 📂 **Selective Uploads** - Choose themes, plugins, uploads, or core files
- 🔄 **Backup & Restore** - Create and restore backups on remote servers
- 🔒 **Secure** - SSH key or password authentication
- 🖥️ **Local App Support** - Works with [Local](https://localwp.com/) by Flywheel

## Installation

```bash
npm install -g move-site
```

## Quick Start

### 1. Configure Your Project

Run the configuration wizard in your WordPress directory:

```bash
move-site config
```

This creates a `.move-site-config.json` file with your environment settings.

### 2. Upload Files

You can specify environments by full domain, type (production/test/local), or partial match:

```bash
# Using environment type
move-site upload production --themes
move-site upload test --plugins --uploads

# Using partial domain match
move-site upload staging --all

# Using full domain
move-site upload staging.example.com --themes --dry-run
```

If multiple environments match (e.g., two test environments), you'll get an interactive selector.

### 3. Manage Backups

```bash
# Create a backup
move-site backup create production --themes

# List backups
move-site backup list test

# Restore from backup
move-site backup restore staging
```

## Commands

| Command | Description |
|---------|-------------|
| `move-site config` | Run configuration wizard |
| `move-site upload <env>` | Upload files/database to environment |
| `move-site backup create <env>` | Create backup on remote server |
| `move-site backup list <env>` | List existing backups |
| `move-site backup download <env>` | Download backups locally |
| `move-site backup delete <env>` | Delete backups |
| `move-site backup restore <env>` | Restore from backup |

## Upload Options

| Option | Description |
|--------|-------------|
| `--all` | Upload all files, database, and update wp-config.php |
| `--themes` | Upload `wp-content/themes` |
| `--plugins` | Upload `wp-content/plugins` |
| `--uploads` | Upload `wp-content/uploads` |
| `--core` | Upload WordPress core files |
| `--database` | Export local DB, upload, import, and replace URLs |
| `--dry-run` | Preview without uploading |
| `--verbose` | Show all files in dry-run |
| `--no-backup` | Skip creating backup before upload |

## Configuration

Environments are keyed by domain for easy CLI usage and automatic URL replacement:

```json
{
  "version": "1.0",
  "name": "my-website",
  "cms": "wordpress",
  "environments": {
    "example.com": {
      "type": "production",
      "url": "https://example.com",
      "ssh": {
        "host": "example.com",
        "port": 22,
        "user": "deploy",
        "keyPath": "~/.ssh/id_rsa",
        "filesOwner": "www-data"
      },
      "remotePath": "/var/www/html/mysite",
      "database": {
        "host": "localhost",
        "name": "mysite_db",
        "user": "db_user",
        "password": "db_password",
        "tablePrefix": "wp_"
      }
    },
    "mysite.local": {
      "type": "local",
      "url": "https://mysite.local",
      "remotePath": "~/Sites/mysite",
      "database": {
        "host": "localhost",
        "name": "local",
        "user": "root",
        "password": "root",
        "tablePrefix": "wp_"
      }
    }
  }
}
```

### Local App (Flywheel) Support

If you use [Local](https://localwp.com/), add these fields to your local environment:

```json
{
  "mysite.local": {
    "type": "local",
    "url": "https://mysite.local",
    "remotePath": "~/Local Sites/mysite/app/public",
    "database": {
      "host": "localhost",
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

## Database Migration

When using `--database` or `--all`, Move Site:

1. **Backs up** the target database first
2. **Dumps** your local database
3. **Uploads** and imports on the remote server
4. **Replaces URLs** in WordPress tables:
   - `wp_options` (home, siteurl)
   - `wp_posts` (guid, post_content)
   - `wp_postmeta`, `wp_comments`, `wp_termmeta`
5. **Updates wp-config.php** (with `--all`)

## Security

⚠️ **Important**: The config file contains sensitive credentials.

- Add `.move-site-config.json` to your `.gitignore`
- Use SSH keys instead of passwords when possible
- Secure file permissions: `chmod 600 .move-site-config.json`

## Documentation

See the [docs](./docs) folder for detailed documentation:

- [Configuration Guide](./docs/configuration.md)
- [Upload Command](./docs/upload.md)
- [Backup Command](./docs/backup.md)
- [Database Operations](./docs/database.md)

## Requirements

- Node.js 18+
- SSH access to remote servers
- MySQL/MariaDB on remote servers

## License

MIT

---

© 2025 [101 Studios](https://101.lu)
