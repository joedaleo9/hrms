const express = require('express');
const { load, save, nextId } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);
router.use(requireRole('admin', 'hr')); // Recruitment is an internal HR/admin tool

// ---- Job openings ----
router.get('/jobs', (req, res) => {
  const data = load();
  res.json(data.job_openings.sort((a, b) => b.created_at.localeCompare(a.created_at)));
});

router.post('/jobs', (req, res) => {
  const { title, department, description, status } = req.body;
  if (!title) return res.status(400).json({ error: 'Job title is required' });

  const data = load();
  const job = {
    id: nextId(data, 'job_openings'),
    title,
    department: department || null,
    description: description || null,
    status: status || 'open', // open | on_hold | closed
    created_at: new Date().toISOString()
  };
  data.job_openings.push(job);
  save(data);
  res.status(201).json({ id: job.id });
});

router.put('/jobs/:id', (req, res) => {
  const { title, department, description, status } = req.body;
  const data = load();
  const job = data.job_openings.find(j => j.id === Number(req.params.id));
  if (!job) return res.status(404).json({ error: 'Job opening not found' });

  job.title = title ?? job.title;
  job.department = department ?? job.department;
  job.description = description ?? job.description;
  job.status = status ?? job.status;
  save(data);
  res.json({ success: true });
});

// ---- Candidates ----
router.get('/candidates', (req, res) => {
  const { job_id } = req.query;
  const data = load();
  const jobsById = Object.fromEntries(data.job_openings.map(j => [j.id, j]));
  let rows = data.candidates;
  if (job_id) rows = rows.filter(c => c.job_id === Number(job_id));
  rows = rows.map(c => ({ ...c, job_title: jobsById[c.job_id]?.title || 'Unknown' }));
  rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  res.json(rows);
});

router.post('/candidates', (req, res) => {
  const { job_id, full_name, email, phone, notes } = req.body;
  if (!job_id || !full_name) return res.status(400).json({ error: 'job_id and full_name are required' });

  const data = load();
  const candidate = {
    id: nextId(data, 'candidates'),
    job_id: Number(job_id),
    full_name,
    email: email || null,
    phone: phone || null,
    stage: 'applied', // applied | interview | offer | hired | rejected
    notes: notes || null,
    created_at: new Date().toISOString()
  };
  data.candidates.push(candidate);
  save(data);
  res.status(201).json({ id: candidate.id });
});

router.put('/candidates/:id', (req, res) => {
  const { stage, notes } = req.body;
  const validStages = ['applied', 'interview', 'offer', 'hired', 'rejected'];
  const data = load();
  const candidate = data.candidates.find(c => c.id === Number(req.params.id));
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

  if (stage) {
    if (!validStages.includes(stage)) return res.status(400).json({ error: 'Invalid stage' });
    candidate.stage = stage;
  }
  if (notes !== undefined) candidate.notes = notes;
  save(data);
  res.json({ success: true });
});

module.exports = router;
