const express = require('express');
const { load, save, nextId } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const data = load();
  const empById = Object.fromEntries(data.employees.map(e => [e.id, e]));

  if (req.user.role === 'admin' || req.user.role === 'hr') {
    const rows = data.assets.map(a => ({ ...a, full_name: empById[a.employee_id]?.full_name })).sort((a, b) => b.allocated_at.localeCompare(a.allocated_at));
    return res.json(rows);
  }
  const rows = data.assets.filter(a => a.employee_id === req.user.id).sort((a, b) => b.allocated_at.localeCompare(a.allocated_at));
  res.json(rows);
});

router.post('/', requireRole('admin', 'hr'), (req, res) => {
  const { employee_id, asset_name, asset_tag, notes } = req.body;
  if (!employee_id || !asset_name) return res.status(400).json({ error: 'employee_id and asset_name are required' });

  const data = load();
  const record = {
    id: nextId(data, 'assets'),
    employee_id: Number(employee_id),
    asset_name,
    asset_tag: asset_tag || null,
    notes: notes || null,
    status: 'allocated', // allocated | returned
    allocated_at: new Date().toISOString(),
    returned_at: null
  };
  data.assets.push(record);
  save(data);
  res.status(201).json({ id: record.id });
});

router.put('/:id/return', requireRole('admin', 'hr'), (req, res) => {
  const data = load();
  const record = data.assets.find(a => a.id === Number(req.params.id));
  if (!record) return res.status(404).json({ error: 'Asset record not found' });
  record.status = 'returned';
  record.returned_at = new Date().toISOString();
  save(data);
  res.json({ success: true });
});

module.exports = router;
