const express = require('express');
const { load, save, nextId } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const data = load();
  const empById = Object.fromEntries(data.employees.map(e => [e.id, e]));

  if (req.user.role === 'admin' || req.user.role === 'hr') {
    const rows = data.loans
      .map(l => ({ ...l, full_name: empById[l.employee_id]?.full_name }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return res.json(rows);
  }
  const rows = data.loans.filter(l => l.employee_id === req.user.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  res.json(rows);
});

router.post('/', (req, res) => {
  const { amount, reason, repayment_months } = req.body;
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'A valid amount is required' });

  const data = load();
  const record = {
    id: nextId(data, 'loans'),
    employee_id: req.user.id,
    amount: Number(amount),
    reason: reason || null,
    repayment_months: repayment_months ? Number(repayment_months) : 1,
    status: 'pending', // pending | approved | rejected | repaid
    amount_repaid: 0,
    created_at: new Date().toISOString()
  };
  data.loans.push(record);
  save(data);
  res.status(201).json({ id: record.id });
});

router.put('/:id', requireRole('admin', 'hr'), (req, res) => {
  const { status, amount_repaid } = req.body;
  const validStatuses = ['pending', 'approved', 'rejected', 'repaid'];
  const data = load();
  const record = data.loans.find(l => l.id === Number(req.params.id));
  if (!record) return res.status(404).json({ error: 'Loan request not found' });

  if (status) {
    if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    record.status = status;
  }
  if (amount_repaid !== undefined) record.amount_repaid = Number(amount_repaid);

  data.audit_log.push({ id: nextId(data, 'audit_log'), actor_id: req.user.id, action: 'review_loan', target: req.params.id, details: status || null, created_at: new Date().toISOString() });
  save(data);
  res.json({ success: true });
});

module.exports = router;
