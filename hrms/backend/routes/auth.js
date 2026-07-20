const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { load, save, nextId } = require('../db');
const { authenticate, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const data = load();
  const user = data.employees.find(e => e.email === email && e.status === 'active');
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign(
    { id: user.id, role: user.role, email: user.email, full_name: user.full_name },
    JWT_SECRET,
    { expiresIn: '8h' }
  );

  data.audit_log.push({ id: nextId(data, 'audit_log'), actor_id: user.id, action: 'login', target: user.email, details: null, created_at: new Date().toISOString() });
  save(data);

  res.json({
    token,
    user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role, employee_code: user.employee_code }
  });
});

router.post('/change-password', authenticate, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }

  const data = load();
  const user = data.employees.find(e => e.id === req.user.id);
  if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  user.password_hash = bcrypt.hashSync(newPassword, 10);
  data.audit_log.push({ id: nextId(data, 'audit_log'), actor_id: user.id, action: 'change_password', target: user.email, details: null, created_at: new Date().toISOString() });
  save(data);

  res.json({ success: true });
});

router.get('/me', authenticate, (req, res) => {
  const data = load();
  const user = data.employees.find(e => e.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  const { password_hash, ...safe } = user;
  res.json(safe);
});

module.exports = router;
