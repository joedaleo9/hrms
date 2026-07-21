const express = require('express');
const { load, save, nextId } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const data = load();
  const empById = Object.fromEntries(data.employees.map(e => [e.id, e]));

  if (req.user.role === 'admin' || req.user.role === 'hr') {
    const rows = data.requests
      .map(r => ({ ...r, full_name: empById[r.employee_id]?.full_name, employee_code: empById[r.employee_id]?.employee_code }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return res.json(rows);
  }
  const rows = data.requests
    .filter(r => r.employee_id === req.user.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  res.json(rows);
});

router.post('/', (req, res) => {
  const { request_type, details, amount } = req.body;
  const validTypes = ['salary_certificate', 'experience_letter', 'id_reissue', 'reimbursement', 'other'];
  if (!request_type || !validTypes.includes(request_type)) {
    return res.status(400).json({ error: 'A valid request_type is required' });
  }
  if (request_type === 'reimbursement' && (!amount || Number(amount) <= 0)) {
    return res.status(400).json({ error: 'A valid amount is required for reimbursement requests' });
  }
  const data = load();
  const record = {
    id: nextId(data, 'requests'),
    employee_id: req.user.id,
    request_type,
    details: details || null,
    amount: request_type === 'reimbursement' ? Number(amount) : null,
    status: 'pending',
    admin_note: null,
    reviewed_by: null,
    created_at: new Date().toISOString(),
    resolved_at: null
  };
  data.requests.push(record);
  save(data);
  res.status(201).json({ id: record.id });
});

router.put('/:id', requireRole('admin', 'hr'), (req, res) => {
  const { status, admin_note } = req.body;
  const validStatuses = ['pending', 'in_progress', 'completed', 'rejected'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const data = load();
  const record = data.requests.find(r => r.id === Number(req.params.id));
  if (!record) return res.status(404).json({ error: 'Request not found' });

  record.status = status;
  record.admin_note = admin_note || null;
  record.reviewed_by = req.user.id;
  record.resolved_at = (status === 'completed' || status === 'rejected') ? new Date().toISOString() : null;

  data.audit_log.push({ id: nextId(data, 'audit_log'), actor_id: req.user.id, action: 'review_request', target: req.params.id, details: status, created_at: new Date().toISOString() });
  save(data);
  res.json({ success: true });
});

module.exports = router;
