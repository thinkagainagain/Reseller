const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const dbFile = process.env.DB_FILE || './data/rebooty.sqlite3';

module.exports = {
  client: 'sqlite3',
  connection: {
    filename: path.resolve(__dirname, '..', '..', dbFile),
  },
  useNullAsDefault: true,
  migrations: {
    directory: path.join(__dirname, 'migrations'),
  },
  seeds: {
    directory: path.join(__dirname, 'seeds'),
  },
};
