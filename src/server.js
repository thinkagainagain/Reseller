require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');

const requireAuth = require('./middleware/requireAuth');
const authRoutes = require('./routes/auth');
const intakeRoutes = require('./routes/intake');
const inventoryRoutes = require('./routes/inventory');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 }, // 30 days
  })
);

app.use(authRoutes);
app.use(requireAuth, intakeRoutes);
app.use(requireAuth, inventoryRoutes);

app.get('/', (req, res) => res.redirect('/intake/queue'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`ReBooty Ops running at http://localhost:${PORT}`);
});
