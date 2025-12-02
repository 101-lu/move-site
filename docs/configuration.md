# Configuration

Move Site uses a JSON configuration file (`.move-site-config.json`) stored in your WordPress root directory. This file contains all environment settings including SSH credentials, database connections, and file paths.

---

## Configuration Wizard

The easiest way to create or update your configuration is using the interactive wizard:

```bash
move-site config
```

The wizard will guide you through:
1. Selecting your CMS (WordPress)
2. Naming your site
3. Configuring one or more environments

To force overwrite an existing configuration:

```bash
move-site config --force
```

---

## Configuration File Structure

Environments are keyed by their domain (without protocol). This enables easy CLI usage and database URL replacement during migration.

```json
{
  "version": "1.0",
  "name": "my-website",
  "cms": "wordpress",
  "environments": {
    "example.com": { "type": "production", "url": "https://example.com", ... },
    "staging.example.com": { "type": "test", "url": "https://staging.example.com", ... },
    "dev.example.com": { "type": "development", "url": "https://dev.example.com", ... },
    "example.local": { "type": "local", "url": "https://example.local", ... }
  },
  "options": {
    "excludePatterns": []
  }
}
```

---

## Environment Configuration

Each environment has the following structure:

### Remote Environment (with SSH)

```json
{
  "type": "production",
  "url": "https://example.com",
  "ssh": {
    "host": "example.com",
    "port": 22,
    "user": "deploy",
    "keyPath": "~/.ssh/id_rsa",
    "filesOwner": "www-data",
    "filesGroup": "www-data"
  },
  "remotePath": "/var/www/html/mysite",
  "database": {
    "host": "localhost",
    "name": "mysite_db",
    "user": "db_user",
    "password": "db_password",
    "tablePrefix": "wp_"
  }
}
```

### Local Environment (no SSH)

```json
{
  "type": "local",
  "url": "https://mysite.local",
  "remotePath": "/Users/developer/Sites/mysite",
  "database": {
    "host": "localhost",
    "name": "mysite_local",
    "user": "root",
    "password": "root",
    "tablePrefix": "wp_"
  }
}
```

### Local App (Flywheel) Environment

If you use [Local](https://localwp.com/) by Flywheel for local WordPress development, you need additional configuration. Local uses its own MySQL binaries and requires a shell script to set up the environment.

#### Finding Your Local Site Configuration

1. Open Local and right-click on your site
2. Select **"Open Site Shell"** - this opens a terminal with the correct MySQL environment
3. The shell script path is shown in Local's site info, typically:
   ```
   ~/Library/Application Support/Local/ssh-entry/[SITE_ID].sh
   ```
4. The MySQL socket is typically at:
   ```
   ~/Library/Application Support/Local/run/[SITE_ID]/mysql/mysqld.sock
   ```

You can also find the site ID by looking at Local's `sites.json`:
```bash
cat ~/Library/Application\ Support/Local/sites.json | grep -A 2 "your-site-name"
```

#### Configuration Example

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

> **Note**: Replace `[SITE_ID]` with your actual site ID (e.g., `8o-e0P_5D`).

#### How It Works

When `localApp.shellScript` is configured:
1. Move Site sources the shell script before running `mysqldump`
2. This sets up the correct `PATH` and `MYSQL_HOME` environment variables
3. The `socket` option tells MySQL to connect via Unix socket instead of TCP

---

## SSH Configuration Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `host` | string | Yes | Server hostname or IP address |
| `port` | number | No | SSH port (default: 22) |
| `user` | string | Yes | SSH username |
| `password` | string | No* | SSH password (if not using key) |
| `keyPath` | string | No* | Path to SSH private key |
| `filesOwner` | string | No | Username for chown after upload |
| `filesGroup` | string | No | Group for chown (defaults to filesOwner) |

*Either `password` or `keyPath` must be provided for remote environments.

---

## Database Configuration Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `host` | string | Yes | Database host (usually `localhost`) |
| `port` | number | No | Database port (default: 3306) |
| `name` | string | Yes | Database name |
| `user` | string | Yes | Database username |
| `password` | string | Yes | Database password |
| `tablePrefix` | string | No | WordPress table prefix (default: `wp_`) |
| `socket` | string | No | Unix socket path for MySQL (for Local app) |

---

## File Ownership (chown)

When uploading files to a server, the files may be owned by the SSH user. If your web server runs as a different user (e.g., `www-data`), you'll need to change ownership.

### Configuration

```json
{
  "ssh": {
    "host": "example.com",
    "user": "deploy",
    "keyPath": "~/.ssh/id_rsa",
    "filesOwner": "www-data",
    "filesGroup": "www-data"
  }
}
```

### Behavior

- After upload/restore, Move Site checks if files have incorrect ownership
- Only files **inside** the remote path are changed (root folder is preserved)
- Uses `find -mindepth 1 -exec chown` to skip the root folder

---

## Environment Types

Each environment has a `type` field that indicates its purpose:

| Type | Description |
|------|-------------|
| `production` | Live production server |
| `test` | Staging/test server |
| `development` | Development server |
| `local` | Local machine (no SSH required) |

The environment key (domain) is used for database URL replacement during migrations.

---

## Example: Full Configuration

```json
{
  "version": "1.0",
  "name": "company-website",
  "cms": "wordpress",
  "environments": {
    "company.com": {
      "type": "production",
      "url": "https://company.com",
      "ssh": {
        "host": "prod.example.com",
        "port": 22,
        "user": "deploy",
        "keyPath": "~/.ssh/id_rsa",
        "filesOwner": "www-data",
        "filesGroup": "www-data"
      },
      "remotePath": "/var/www/html/company",
      "database": {
        "host": "localhost",
        "name": "company_prod",
        "user": "company_user",
        "password": "secure_password_123",
        "tablePrefix": "wp_"
      }
    },
    "staging.company.com": {
      "type": "test",
      "url": "https://staging.company.com",
      "ssh": {
        "host": "staging.example.com",
        "port": 22,
        "user": "deploy",
        "keyPath": "~/.ssh/id_rsa",
        "filesOwner": "ftpuser",
        "filesGroup": "ftpgroup"
      },
      "remotePath": "/home/ftpuser/public_html",
      "database": {
        "host": "localhost",
        "name": "company_staging",
        "user": "staging_user",
        "password": "staging_password",
        "tablePrefix": "wp_"
      }
    },
    "company.local": {
      "type": "local",
      "url": "https://company.local",
      "remotePath": "~/Local Sites/company/app/public",
      "database": {
        "host": "localhost",
        "port": 10003,
        "name": "local",
        "user": "root",
        "password": "root",
        "tablePrefix": "wp_",
        "socket": "~/Library/Application Support/Local/run/abc123/mysql/mysqld.sock"
      },
      "localApp": {
        "shellScript": "~/Library/Application Support/Local/ssh-entry/abc123.sh"
      }
    }
  },
  "options": {
    "excludePatterns": []
  }
}
```

---

## Security Notes

⚠️ **Important**: The configuration file contains sensitive credentials.

- Add `.move-site-config.json` to your `.gitignore`
- Use SSH keys instead of passwords when possible
- Consider using environment-specific config files for CI/CD

---

© 2025 101 Studios
