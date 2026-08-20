const bcrypt = require('bcryptjs');
const config = require('../../config');

exports.seed = async function (knex) {
  const username = config.auth.adminUsername;
  const password = config.auth.adminPassword;

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
