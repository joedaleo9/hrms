const express = require('express');
const { load, save, nextId } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const DOC_TYPES = ['passport', 'visa', 'work_permit', 'driving_license', 'emirates_id', 'other'];

router.get('/', (req, res) => {
  const data = load();
  const empById = Object.fromEntries(data.employees.map(e => [e.id, e]));

  if (req.user.role === 'admin' || req.user.role === 'hr') {
    const { employee_id } = req.query;
    let rows = data.documents;
    if (employee_id) rows = rows.filter(d => d.employee_id === Number(employee_id));
    rows = rows.map(d => ({ ...d, full_name: empById[d.employee_id]?.full_name, employee_code: empById[d.employee_id]?.employee_code }));
    rows.sort((a, b) => (a.expiry_date || '9999').localeCompare(b.expiry_date || '9999'));
    return res.json(rows);
  }
  const rows = data.documents.filter(d => d.employee_id === req.user.id).sort((a, b) => (a.expiry_date || '9999').localeCompare(b.expiry_date || '9999'));
  res.json(rows);
});

// Documents expiring within N days (default 60) - for dashboard alerts. Admin/HR only.
router.get('/expiring', requireRole('admin', 'hr'), (req, res) => {
  const days = Number(req.query.days) || 60;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  const data = load();
  const empById = Object.fromEntries(data.employees.map(e => [e.id, e]));
  const rows = data.documents
    .filter(d => d.expiry_date && d.expiry_date <= cutoffStr)
    .map(d => ({ ...d, full_name: empById[d.employee_id]?.full_name, is_expired: d.expiry_date < today }))
    .sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));
  res.json(rows);
});

router.post('/', requireRole('admin', 'hr'), (req, res) => {
  const { employee_id, doc_type, doc_number, expiry_date, notes } = req.body;
  if (!employee_id || !doc_type || !DOC_TYPES.includes(doc_type)) {
    return res.status(400).json({ error: 'employee_id and a valid doc_type are required' });
  }
  const data = load();
  const record = {
    id: nextId(data, 'documents'),
    employee_id: Number(employee_id),
    doc_type,
    doc_number: doc_number || null,
    expiry_date: expiry_date || null,
    notes: notes || null,
    created_at: new Date().toISOString()
  };
  data.documents.push(record);
  save(data);
  res.status(201).json({ id: record.id });
});

router.put('/:id', requireRole('admin', 'hr'), (req, res) => {
  const { doc_number, expiry_date, notes } = req.body;
  const data = load();
  const record = data.documents.find(d => d.id === Number(req.params.id));
  if (!record) return res.status(404).json({ error: 'Document not found' });
  record.doc_number = doc_number ?? record.doc_number;
  record.expiry_date = expiry_date ?? record.expiry_date;
  record.notes = notes ?? record.notes;
  save(data);
  res.json({ success: true });
});

router.delete('/:id', requireRole('admin', 'hr'), (req, res) => {
  const data = load();
  data.documents = data.documents.filter(d => d.id !== Number(req.params.id));
  save(data);
  res.json({ success: true });
});

module.exports = router;
