# Mamun Islam Automation System

A production-grade, integrated automation platform featuring a Telegram bot, advanced dashboard management, AI endpoints, and robust backend services.

## Features

- **Telegram Bot Integration**: Automated workflows, notifications, and user rewards management.
- **Advanced Dashboard**: Real-time monitoring and control panel built with modern React and Tailwind CSS.
- **Backend Services**: Secure Node.js & Express server handling API requests, bot logic, and database operations.
- **AI Integration**: Powered by Gemini API for intelligent automation and data processing.

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure environment variables in `.env.example` / `.env`.
3. Start the application:
   ```bash
   npm run dev
   ```

## Database Setup (MySQL)

This project requires a MySQL database. Firebase has been removed; all data is stored in MySQL.

Required environment variables:

| Variable      | Default       | Description              |
|---------------|---------------|--------------------------|
| `DB_HOST`     | `localhost`   | MySQL host               |
| `DB_PORT`     | `3306`        | MySQL port               |
| `DB_USER`     | `root`        | MySQL user               |
| `DB_PASSWORD` | _(empty)_     | MySQL password           |
| `DB_NAME`     | `autosverify` | MySQL database name      |

To create the required tables, run the SQL script:

```bash
mysql -u root -p autosverify < database/db-setup.sql
```

The app will also auto-create tables (`bot_settings`, `bot_users`) on first startup if the MySQL connection is available. If MySQL is unreachable, it falls back to a local `database.json` file.

