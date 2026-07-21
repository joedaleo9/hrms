const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { load, save, nextId } = require('../db');
const { authenticate, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

// Limits brute-force guessing on login and password-reset endpoints.
// 10 attempts per 15 minutes per IP address.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' }
});

router.post('/login', authLimiter, (req, res) => {
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
  const { password_hash, security_answer_hash, ...safe } = user;
  res.json(safe);
});

// Set or update a security question, used later to self-service reset a forgotten password.
router.post('/security-question', authenticate, (req, res) => {
  const { question, answer } = req.body;
  if (!question || !answer || answer.trim().length < 2) {
    return res.status(400).json({ error: 'A question and answer are required' });
  }
  const data = load();
  const user = data.employees.find(e => e.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Not found' });

  user.security_question = question;
  user.security_answer_hash = bcrypt.hashSync(answer.trim().toLowerCase(), 10);
  save(data);
  res.json({ success: true });
});

// Step 1 of forgot-password: look up whether this email has a security question set.
// Deliberately returns the same generic response whether or not the account/question exists,
// so this endpoint can't be used to discover which emails have accounts.
router.post('/forgot-password/lookup', authLimiter, (req, res) => {
  const { email } = req.body;
  const data = load();
  const user = data.employees.find(e => e.email === email && e.status === 'active');
  if (user && user.security_question) {
    return res.json({ has_question: true, question: user.security_question });
  }
  res.json({ has_question: false });
});

// Step 2 of forgot-password: verify the answer and set a new password.
router.post('/forgot-password/reset', authLimiter, (req, res) => {
  const { email, answer, newPassword } = req.body;
  if (!email || !answer || !newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Email, answer, and a new password (min 8 characters) are required' });
  }
  const data = load();
  const user = data.employees.find(e => e.email === email && e.status === 'active');
  if (!user || !user.security_answer_hash) {
    return res.status(400).json({ error: 'No security question is set up for this account. Contact your HR or system administrator.' });
  }
  const valid = bcrypt.compareSync(answer.trim().toLowerCase(), user.security_answer_hash);
  if (!valid) {
    return res.status(401).json({ error: 'That answer doesn\'t match.' });
  }

  user.password_hash = bcrypt.hashSync(newPassword, 10);
  data.audit_log.push({ id: nextId(data, 'audit_log'), actor_id: user.id, action: 'self_service_password_reset', target: user.email, details: null, created_at: new Date().toISOString() });
  save(data);
  res.json({ success: true });
});

module.exports = router;
