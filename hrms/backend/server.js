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

// Serve the frontend
app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`HRMS server running on http://localhost:${PORT}`);
});
