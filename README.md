# Site Move

CLI tool for moving website files and databases between environments (local, staging, production).

## Features

- 📁 Transfer files via SSH/SFTP
- 🔧 Interactive configuration wizard
- 🎯 WordPress support (more CMS coming soon)
- 📂 Selective uploads (themes, plugins, uploads, core)
- 🔒 SSH key or password authentication
- 📝 Written in TypeScript with full type safety

## Installation

```bash
npm install -g site-move
```

Or for development:

```bash
git clone <repo>
cd move-site
npm install
npm run build
npm link
```

## Usage

### First Time Setup

Run the configuration wizard:

```bash
site-move config
```

This will create a `.move-site-config.json` file in your project directory.

### Upload Files

Upload to a configured environment:

```bash
# Upload all files
site-move upload production

# Upload specific folders
site-move upload staging --themes
site-move upload test --plugins --uploads

# Dry run to see what would be uploaded
site-move upload production --themes --dry-run
```

### Available Options

| Option       | Description                                        |
| ------------ | -------------------------------------------------- |
| `--all`      | Upload all files (default if no options specified) |
| `--uploads`  | Upload wp-content/uploads                          |
| `--plugins`  | Upload wp-content/plugins                          |
| `--themes`   | Upload wp-content/themes                           |
| `--core`     | Upload WordPress core files                        |
| `--database` | Export and upload database (coming soon)           |
| `--dry-run`  | Show what would be uploaded without uploading      |

### Commands

```bash
site-move --help       # Show help
site-move --version    # Show version
site-move config       # Run configuration wizard
site-move upload <env> # Upload to environment
```

## Configuration

The configuration file (`.move-site-config.json`) stores your environment settings:

```json
{
  "version": "1.0",
  "cms": "wordpress",
  "environments": {
    "production": {
      "type": "production",
      "ssh": {
        "host": "example.com",
        "port": 22,
        "user": "username",
        "keyPath": "~/.ssh/id_rsa"
      },
      "remotePath": "/var/www/html",
      "database": {
        "host": "localhost",
        "name": "wordpress_db",
        "user": "db_user",
        "password": "db_password"
      }
    }
  },
  "options": {
    "excludePatterns": [".git", "node_modules", ".DS_Store"]
  }
}
```

## Security

⚠️ **Important**: The config file may contain sensitive credentials. Make sure to:

1. Add `.move-site-config.json` to your `.gitignore`
2. Use SSH keys instead of passwords when possible
3. Secure file permissions: `chmod 600 .move-site-config.json`

## Roadmap

- [ ] Database export/import
- [ ] FTP/FTPS support
- [ ] Download from remote
- [ ] Sync (two-way)
- [ ] Drupal support
- [ ] Custom CMS support
- [ ] Backup before upload

## License

MIT
