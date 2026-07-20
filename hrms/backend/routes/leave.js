const express = require('express');
const { load, save, nextId } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const data = load();
  const empById = Object.fromEntries(data.employees.map(e => [e.id, e]));

  if (req.user.role === 'admin' || req.user.role === 'hr') {
    const rows = data.leave_requests
      .map(l => ({ ...l, full_name: empById[l.employee_id]?.full_name }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return res.json(rows);
  }
  const rows = data.leave_requests
    .filter(l => l.employee_id === req.user.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  res.json(rows);
});

router.post('/', (req, res) => {
  const { leave_type, start_date, end_date, reason } = req.body;
  if (!leave_type || !start_date || !end_date) {
    return res.status(400).json({ error: 'leave_type, start_date, and end_date are required' });
  }
  const data = load();
  const record = {
    id: nextId(data, 'leave_requests'),
    employee_id: req.user.id,
    leave_type, start_date, end_date,
    reason: reason || null,
    status: 'pending',
    reviewed_by: null,
    created_at: new Date().toISOString()
  };
  data.leave_requests.push(record);
  save(data);
  res.status(201).json({ id: record.id });
});

router.put('/:id', requireRole('admin', 'hr'), (req, res) => {
  const { status } = req.body;
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: "status must be 'approved' or 'rejected'" });
  }
  const data = load();
  const record = data.leave_requests.find(l => l.id === Number(req.params.id));
  if (!record) return res.status(404).json({ error: 'Leave request not found' });
  record.status = status;
  record.reviewed_by = req.user.id;

  data.audit_log.push({ id: nextId(data, 'audit_log'), actor_id: req.user.id, action: 'review_leave', target: req.params.id, details: status, created_at: new Date().toISOString() });
  save(data);
  res.json({ success: true });
});

module.exports = router;
