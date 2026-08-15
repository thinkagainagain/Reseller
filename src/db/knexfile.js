const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

// DB_CLIENT=pg in production (Supabase's managed Postgres, connected via
// Hostinger's Web App "Connect a database" integration -- no native
// compilation needed, unlike the SQLite drivers that don't build on
// Hostinger's runtime). Defaults to SQLite for local dev -- one file, no
// server process to install or run.
const client = process.env.DB_CLIENT || 'better-sqlite3';

if (client === 'pg') {
  // By default node-postgres parses DATE columns into JS Date objects,
  // while better-sqlite3 (local dev) returns plain 'YYYY-MM-DD' strings.
  // That mismatch broke <input type="date"> rendering in production (a
  // stringified Date isn't a valid date-input value, so the field showed
  // blank even when the DB had a real date). Force DATE (oid 1082) to
  // come back as a plain string in both environments alike.
  const { types } = require('pg');
  types.setTypeParser(1082, (val) => val);
}

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
