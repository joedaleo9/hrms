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
const recruitmentRoutes = require('./routes/recruitment');
const exitRoutes = require('./routes/exit');
const documentRoutes = require('./routes/documents');
const loanRoutes = require('./routes/loans');
const assetRoutes = require('./routes/assets');
const employeeRecordsRoutes = require('./routes/employee-records');
const gradeRoutes = require('./routes/grades');
const db = require('./db');
const { authenticate, requireRole } = require('./middleware/auth');
const rateLimit = require('express-rate-limit');

const emergencyResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' }
});

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
app.use('/api/recruitment', recruitmentRoutes);
app.use('/api/exit', exitRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/loans', loanRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/records', employeeRecordsRoutes);
app.use('/api/grades', gradeRoutes);

// Public endpoint - lets the login screen show which brand/company this system belongs to
app.get('/api/settings/brand', (req, res) => {
  const data = db.load();
  res.json({ brand_name: data.settings.brand_name || 'HRMS', logo_url: data.settings.logo_url || null });
});

// Admin-only: update brand name / logo without needing to redeploy code
app.put('/api/settings/brand', authenticate, requireRole('admin'), (req, res) => {
  const { brand_name, logo_url } = req.body;
  const data = db.load();
  if (brand_name !== undefined) data.settings.brand_name = brand_name || 'HRMS';
  if (logo_url !== undefined) data.settings.logo_url = logo_url || null;
  db.save(data);
  res.json({ success: true });
});

// Emergency password reset - for hosting plans without shell/terminal access.
// Protected by a secret set in your environment variables (EMERGENCY_RESET_SECRET).
// Visit in your browser: https://your-app-url/api/emergency-reset?secret=YOUR_SECRET&email=you@company.com&password=NewPassword123
app.get('/api/emergency-reset', emergencyResetLimiter, (req, res) => {
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
  let user = data.employees.find(e => e.email === email);

  if (!user) {
    // No account found (often because the data file was reset) - create a fresh admin account instead of failing.
    const nextId = (data._next_id.employees || 1);
    data._next_id.employees = nextId + 1;
    user = {
      id: nextId,
      employee_code: `EMP${String(nextId).padStart(4, '0')}`,
      full_name: 'Admin',
      email,
      password_hash: '',
      role: 'admin',
      department: data.settings.brand_name || null,
      designation: 'System Admin',
      date_of_joining: new Date().toISOString().slice(0, 10),
      phone: null,
      status: 'active',
      created_at: new Date().toISOString()
    };
    data.employees.push(user);
  }

  user.password_hash = bcrypt.hashSync(password, 10);
  db.save(data);

  res.send(`Account ready for ${email}. You can now log in with the new password. Consider removing EMERGENCY_RESET_SECRET from your environment variables once done.`);
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
