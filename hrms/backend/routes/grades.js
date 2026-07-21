const express = require('express');
const { load, save, nextId } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const data = load();
  res.json(data.grades);
});

router.post('/', requireRole('admin', 'hr'), (req, res) => {
  const { name, benefits } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const data = load();
  const record = { id: nextId(data, 'grades'), name, benefits: benefits || null };
  data.grades.push(record);
  save(data);
  res.status(201).json({ id: record.id });
});

router.put('/:id', requireRole('admin', 'hr'), (req, res) => {
  const { name, benefits } = req.body;
  const data = load();
  const record = data.grades.find(g => g.id === Number(req.params.id));
  if (!record) return res.status(404).json({ error: 'Grade not found' });
  record.name = name ?? record.name;
  record.benefits = benefits ?? record.benefits;
  save(data);
  res.json({ success: true });
});

router.delete('/:id', requireRole('admin', 'hr'), (req, res) => {
  const data = load();
  data.grades = data.grades.filter(g => g.id !== Number(req.params.id));
  save(data);
  res.json({ success: true });
});

module.exports = router;
