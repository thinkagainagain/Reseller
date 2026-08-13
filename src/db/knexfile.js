const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

// DB_CLIENT=pg in production (Supabase's managed Postgres, connected via
// Hostinger's Web App "Connect a database" integration -- no native
// compilation needed, unlike the SQLite drivers that don't build on
// Hostinger's runtime). Defaults to SQLite for local dev -- one file, no
// server process to install or run.
const client = process.env.DB_CLIENT || 'better-sqlite3';

const dbConfig =
  client === 'pg'
    ? {
        client: 'pg',
        connection: {
          connectionString: process.env.DATABASE_URL,
          ssl: { rejectUnauthorized: false },
        },
      }
    : {
        client: 'better-sqlite3',
        connection: {
          filename: path.resolve(__dirname, '..', '..', process.env.DB_FILE || './data/rebooty.sqlite3'),
        },
        useNullAsDefault: true,
      };

module.exports = {
  ...dbConfig,
  migrations: {
    directory: path.join(__dirname, 'migrations'),
  },
  seeds: {
    directory: path.join(__dirname, 'seeds'),
  },
};
