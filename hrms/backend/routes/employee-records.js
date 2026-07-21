const express = require('express');
const { load, save, nextId } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

function canAccess(req, employeeId) {
  return req.user.role === 'admin' || req.user.role === 'hr' || req.user.id === employeeId;
}

// ---- Dependents ----
router.get('/dependents', (req, res) => {
  const data = load();
  const targetId = (req.user.role === 'admin' || req.user.role === 'hr') && req.query.employee_id
    ? Number(req.query.employee_id) : req.user.id;
  if (!canAccess(req, targetId)) return res.status(403).json({ error: 'Insufficient permissions' });
  res.json(data.dependents.filter(d => d.employee_id === targetId));
});

router.post('/dependents', (req, res) => {
  const { employee_id, full_name, relationship, date_of_birth } = req.body;
  const targetId = (req.user.role === 'admin' || req.user.role === 'hr') && employee_id ? Number(employee_id) : req.user.id;
  if (!canAccess(req, targetId)) return res.status(403).json({ error: 'Insufficient permissions' });
  if (!full_name || !relationship) return res.status(400).json({ error: 'full_name and relationship are required' });

  const data = load();
  const record = { id: nextId(data, 'dependents'), employee_id: targetId, full_name, relationship, date_of_birth: date_of_birth || null };
  data.dependents.push(record);
  save(data);
  res.status(201).json({ id: record.id });
});

router.delete('/dependents/:id', (req, res) => {
  const data = load();
  const record = data.dependents.find(d => d.id === Number(req.params.id));
  if (!record) return res.status(404).json({ error: 'Not found' });
  if (!canAccess(req, record.employee_id)) return res.status(403).json({ error: 'Insufficient permissions' });
  data.dependents = data.dependents.filter(d => d.id !== Number(req.params.id));
  save(data);
  res.json({ success: true });
});

// ---- Skills & education ----
router.get('/skills', (req, res) => {
  const data = load();
  const targetId = (req.user.role === 'admin' || req.user.role === 'hr') && req.query.employee_id
    ? Number(req.query.employee_id) : req.user.id;
  if (!canAccess(req, targetId)) return res.status(403).json({ error: 'Insufficient permissions' });
  res.json(data.skills.filter(s => s.employee_id === targetId));
});

router.post('/skills', (req, res) => {
  const { employee_id, type, label, detail } = req.body;
  const targetId = (req.user.role === 'admin' || req.user.role === 'hr') && employee_id ? Number(employee_id) : req.user.id;
  if (!canAccess(req, targetId)) return res.status(403).json({ error: 'Insufficient permissions' });
  const validTypes = ['skill', 'education', 'certification'];
  if (!validTypes.includes(type) || !label) return res.status(400).json({ error: 'A valid type and label are required' });

  const data = load();
  const record = { id: nextId(data, 'skills'), employee_id: targetId, type, label, detail: detail || null };
  data.skills.push(record);
  save(data);
  res.status(201).json({ id: record.id });
});

router.delete('/skills/:id', (req, res) => {
  const data = load();
  const record = data.skills.find(s => s.id === Number(req.params.id));
  if (!record) return res.status(404).json({ error: 'Not found' });
  if (!canAccess(req, record.employee_id)) return res.status(403).json({ error: 'Insufficient permissions' });
  data.skills = data.skills.filter(s => s.id !== Number(req.params.id));
  save(data);
  res.json({ success: true });
});

module.exports = router;
