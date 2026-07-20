require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const employeeRoutes = require('./routes/employees');
const payrollRoutes = require('./routes/payroll');
const attendanceRoutes = require('./routes/attendance');
const leaveRoutes = require('./routes/leave');
const requestRoutes = require('./routes/requests');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

// Basic request rate limiting could be added here (e.g. express-rate-limit) before production use.

app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leave', leaveRoutes);
app.use('/api/requests', requestRoutes);

// Public endpoint - lets the login screen show which brand/company this system belongs to
app.get('/api/settings/brand', (req, res) => {
  const data = db.load();
  res.json({ brand_name: data.settings.brand_name || 'HRMS' });
});

// Emergency password reset - for hosting plans without shell/terminal access.
// Protected by a secret set in your environment variables (EMERGENCY_RESET_SECRET).
// Visit in your browser: https://your-app-url/api/emergency-reset?secret=YOUR_SECRET&email=you@company.com&password=NewPassword123
app.get('/api/emergency-reset', (req, res) => {
  const { secret, email, password } = req.query;
  const expectedSecret = process.env.EMERGENCY_RESET_SECRET;

  if (!expectedSecret) {
    return res.status(403).send('EMERGENCY_RESET_SECRET is not set on this server. Add it in your hosting provider\'s environment variables first.');
  }
  if (secret !== expectedSecret) {
    return res.status(403).send('Incorrect secret.');
  }
  if (!email || !password || password.length < 8) {
    return res.status(400).send('Provide ?email=...&password=... (password must be at least 8 characters) in the URL.');
  }

  const bcrypt = require('bcryptjs');
  const data = db.load();
  const user = data.employees.find(e => e.email === email);
  if (!user) {
    return res.status(404).send(`No account found with email: ${email}`);
  }
  user.password_hash = bcrypt.hashSync(password, 10);
  db.save(data);

  res.send(`Password reset successfully for ${email}. You can now log in with the new password. Consider removing EMERGENCY_RESET_SECRET from your environment variables once done.`);
});

// Serve the frontend
app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`HRMS server running on http://localhost:${PORT}`);
});
