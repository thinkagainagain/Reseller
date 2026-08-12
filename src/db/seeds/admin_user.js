const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '.env') });
const bcrypt = require('bcryptjs');

exports.seed = async function (knex) {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    console.warn('ADMIN_USERNAME/ADMIN_PASSWORD not set in .env — skipping admin user seed.');
    return;
  }

  const existing = await knex('users').where({ username }).first();
  if (existing) {
    return;
  }

  const password_hash = await bcrypt.hash(password, 10);
  await knex('users').insert({ username, password_hash });
};
