# Move Site Documentation

Welcome to the **Move Site** CLI tool documentation. This tool helps you move WordPress sites between environments (local, development, staging, production) with ease.

---

## What is Move Site?

Move Site is a command-line tool designed to simplify the process of transferring WordPress files and databases between different server environments. Whether you're pushing local changes to a staging server or deploying to production, Move Site handles:

- **File transfers** — Upload themes, plugins, uploads, or entire WordPress installations
- **Database sync** — Backup and restore MySQL databases with table prefix support
- **Automatic backups** — Safety net before every upload operation
- **Smart compression** — Archive-based transfers for faster uploads

---

## Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/101-lu/move-site.git
cd move-site

# Install dependencies
npm install

# Build the project
npm run build

# Link globally (optional)
npm link
```

### First Run

```bash
# Run the configuration wizard
move-site config

# Upload themes to test environment
move-site upload test --themes

# Create a database backup
move-site backup create production --database
```

---

## Key Features

| Feature | Description |
|---------|-------------|
| 🔧 **Interactive Config** | Step-by-step wizard to configure environments |
| 📤 **Fast Uploads** | Archive-based transfers (tar.gz) instead of file-by-file |
| 💾 **Auto Backups** | Creates backup before every upload (can be skipped) |
| 🗄️ **Database Support** | mysqldump with table prefix filtering |
| 👤 **File Ownership** | Automatic chown after upload/restore |
| 🔒 **SSH Key Auth** | Supports both password and SSH key authentication |

---

## Documentation Pages

1. **[Configuration](./configuration.md)** — Setting up environments and config file structure
2. **[Upload Command](./upload.md)** — Uploading files to remote environments
3. **[Backup Command](./backup.md)** — Creating, listing, downloading, and restoring backups
4. **[Database Operations](./database.md)** — Database backup and restore workflows

---

## Requirements

- **Node.js** 18+ 
- **npm** or **yarn**
- **SSH access** to remote servers
- **tar** command available locally (for archive creation)
- **MySQL/MariaDB** client on remote server (for database operations)

---

## Support

For issues and feature requests, please contact the 101 Studios development team.

---

© 2025 101 Studios
