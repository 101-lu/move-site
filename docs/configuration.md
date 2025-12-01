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

```json
{
  "version": "1.0",
  "name": "my-website",
  "cms": "wordpress",
  "environments": {
    "production": { ... },
    "test": { ... },
    "development": { ... },
    "local": { ... }
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

| Type | Description |
|------|-------------|
| `production` | Live production server |
| `test` | Staging/test server |
| `development` | Development server |
| `local` | Local machine (no SSH required) |

---

## Example: Full Configuration

```json
{
  "version": "1.0",
  "name": "company-website",
  "cms": "wordpress",
  "environments": {
    "production": {
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
    "test": {
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
    "local": {
      "remotePath": "/Users/dev/Sites/company",
      "database": {
        "host": "localhost",
        "name": "company_local",
        "user": "root",
        "password": "root",
        "tablePrefix": "wp_"
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
