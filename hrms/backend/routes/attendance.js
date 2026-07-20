const express = require('express');
const { load, save, nextId } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const data = load();
  const empById = Object.fromEntries(data.employees.map(e => [e.id, e]));
  const { employee_id, from, to } = req.query;
  const isPrivileged = req.user.role === 'admin' || req.user.role === 'hr';
  const targetId = isPrivileged ? (employee_id ? Number(employee_id) : null) : req.user.id;

  let rows = data.attendance;
  if (targetId) rows = rows.filter(a => a.employee_id === targetId);
  if (from) rows = rows.filter(a => a.date >= from);
  if (to) rows = rows.filter(a => a.date <= to);
  rows = rows.map(a => ({ ...a, full_name: empById[a.employee_id]?.full_name }));
  rows.sort((a, b) => b.date.localeCompare(a.date));

  res.json(rows);
});

router.post('/check-in', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  const data = load();

  if (data.attendance.some(a => a.employee_id === req.user.id && a.date === today)) {
    return res.status(400).json({ error: 'Already checked in today' });
  }
  data.attendance.push({ id: nextId(data, 'attendance'), employee_id: req.user.id, date: today, check_in: now, check_out: null, status: 'present' });
  save(data);
  res.json({ success: true });
});

router.post('/check-out', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  const data = load();

  const record = data.attendance.find(a => a.employee_id === req.user.id && a.date === today);
  if (!record) return res.status(400).json({ error: 'No check-in found for today' });
  record.check_out = now;
  save(data);
  res.json({ success: true });
});

router.put('/:id', requireRole('admin', 'hr'), (req, res) => {
  const { check_in, check_out, status } = req.body;
  const data = load();
  const record = data.attendance.find(a => a.id === Number(req.params.id));
  if (!record) return res.status(404).json({ error: 'Attendance record not found' });
  record.check_in = check_in || null;
  record.check_out = check_out || null;
  record.status = status || 'present';
  save(data);
  res.json({ success: true });
});

module.exports = router;
