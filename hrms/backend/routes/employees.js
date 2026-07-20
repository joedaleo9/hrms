const express = require('express');
const bcrypt = require('bcryptjs');
const { load, save, nextId } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

function safeEmp(e) {
  const { password_hash, ...rest } = e;
  return rest;
}

// List employees - admin/hr see all, employees see only themselves
router.get('/', (req, res) => {
  const data = load();
  if (req.user.role === 'admin' || req.user.role === 'hr') {
    return res.json(data.employees.map(safeEmp).sort((a, b) => a.full_name.localeCompare(b.full_name)));
  }
  const self = data.employees.find(e => e.id === req.user.id);
  res.json(self ? [safeEmp(self)] : []);
});

// Get one employee - self or admin/hr
router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (req.user.role === 'employee' && req.user.id !== id) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const data = load();
  const row = data.employees.find(e => e.id === id);
  if (!row) return res.status(404).json({ error: 'Employee not found' });
  res.json(safeEmp(row));
});

// Create employee - admin/hr only
router.post('/', requireRole('admin', 'hr'), (req, res) => {
  const { employee_code, full_name, email, password, role, department, designation, date_of_joining, phone } = req.body;
  if (!employee_code || !full_name || !email || !password) {
    return res.status(400).json({ error: 'employee_code, full_name, email, and password are required' });
  }
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const data = load();
  if (data.employees.some(e => e.employee_code === employee_code || e.email === email)) {
    return res.status(400).json({ error: 'Employee code or email already exists' });
  }

  const assignedRole = (role === 'admin' || role === 'hr') && req.user.role !== 'admin' ? 'employee' : (role || 'employee');
  const hash = bcrypt.hashSync(password, 10);

  const newEmp = {
    id: nextId(data, 'employees'),
    employee_code, full_name, email,
    password_hash: hash,
    role: assignedRole,
    department: department || null,
    designation: designation || null,
    date_of_joining: date_of_joining || null,
    phone: phone || null,
    status: 'active',
    created_at: new Date().toISOString()
  };
  data.employees.push(newEmp);
  data.audit_log.push({ id: nextId(data, 'audit_log'), actor_id: req.user.id, action: 'create_employee', target: email, details: null, created_at: new Date().toISOString() });
  save(data);

  res.status(201).json({ id: newEmp.id });
});

// Update employee
router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const { full_name, department, designation, date_of_joining, phone, role, status } = req.body;
  const data = load();
  const emp = data.employees.find(e => e.id === id);
  if (!emp) return res.status(404).json({ error: 'Employee not found' });

  if (req.user.role === 'employee') {
    if (req.user.id !== id) return res.status(403).json({ error: 'Insufficient permissions' });
    emp.phone = phone || null;
    save(data);
    return res.json({ success: true });
  }

  emp.full_name = full_name ?? emp.full_name;
  emp.department = department || null;
  emp.designation = designation || null;
  emp.date_of_joining = date_of_joining || null;
  emp.phone = phone || null;
  emp.role = role || 'employee';
  emp.status = status || 'active';

  data.audit_log.push({ id: nextId(data, 'audit_log'), actor_id: req.user.id, action: 'update_employee', target: String(id), details: null, created_at: new Date().toISOString() });
  save(data);
  res.json({ success: true });
});

// Deactivate - admin only (never hard-delete, to preserve payroll/attendance history)
router.delete('/:id', requireRole('admin'), (req, res) => {
  const data = load();
  const emp = data.employees.find(e => e.id === Number(req.params.id));
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  emp.status = 'inactive';
  data.audit_log.push({ id: nextId(data, 'audit_log'), actor_id: req.user.id, action: 'deactivate_employee', target: req.params.id, details: null, created_at: new Date().toISOString() });
  save(data);
  res.json({ success: true });
});

module.exports = router;
