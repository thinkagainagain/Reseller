const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

router.get('/login', (req, res) => {
  res.render('login', { error: null });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await db('users').where({ username }).first();

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.render('login', { error: 'Invalid username or password.' });
  }

  req.session.userId = user.id;
  req.session.username = user.username;
  res.redirect('/dashboard');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

router.get('/account', requireAuth, (req, res) => {
  res.render('account', { error: null, success: null });
});

router.post('/account/password', requireAuth, async (req, res) => {
  const { current_password, new_password, confirm_password } = req.body;
  const user = await db('users').where({ id: req.session.userId }).first();

  if (!user || !(await bcrypt.compare(current_password, user.password_hash))) {
    return res.render('account', { error: 'Current password is incorrect.', success: null });
  }

  if (!new_password || new_password.length < 8) {
    return res.render('account', { error: 'New password must be at least 8 characters.', success: null });
  }

  if (new_password !== confirm_password) {
    return res.render('account', { error: 'New password and confirmation do not match.', success: null });
  }

  const password_hash = await bcrypt.hash(new_password, 10);
  await db('users').where({ id: user.id }).update({ password_hash });

  res.render('account', { error: null, success: 'Password updated.' });
});

module.exports = router;
