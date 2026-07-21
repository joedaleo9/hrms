const express = require('express');
const { load, save, nextId } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// List exits - admin/hr see all, employees see only their own
router.get('/', (req, res) => {
  const data = load();
  const empById = Object.fromEntries(data.employees.map(e => [e.id, e]));

  if (req.user.role === 'admin' || req.user.role === 'hr') {
    const rows = data.exits
      .map(x => ({ ...x, full_name: empById[x.employee_id]?.full_name, employee_code: empById[x.employee_id]?.employee_code }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return res.json(rows);
  }
  const rows = data.exits.filter(x => x.employee_id === req.user.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  res.json(rows);
});

// Employee submits their own resignation. Admin/HR can also initiate on behalf of an employee (e.g. termination).
router.post('/', (req, res) => {
  const { employee_id, resignation_date, requested_last_day, reason } = req.body;
  const isPrivileged = req.user.role === 'admin' || req.user.role === 'hr';
  const targetEmployeeId = isPrivileged && employee_id ? Number(employee_id) : req.user.id;

  if (!requested_last_day) return res.status(400).json({ error: 'requested_last_day is required' });

  const data = load();
  if (data.exits.some(x => x.employee_id === targetEmployeeId && x.status !== 'completed' && x.status !== 'withdrawn')) {
    return res.status(400).json({ error: 'This employee already has an active exit in progress' });
  }

  const record = {
    id: nextId(data, 'exits'),
    employee_id: targetEmployeeId,
    resignation_date: resignation_date || new Date().toISOString().slice(0, 10),
    requested_last_day,
    confirmed_last_day: null,
    reason: reason || null,
    status: 'notice_period', // notice_period | clearance | completed | withdrawn
    clearance_notes: null,
    created_at: new Date().toISOString()
  };
  data.exits.push(record);
  save(data);
  res.status(201).json({ id: record.id });
});

// Admin/HR update status, confirm last day, add clearance notes
router.put('/:id', requireRole('admin', 'hr'), (req, res) => {
  const { status, confirmed_last_day, clearance_notes } = req.body;
  const validStatuses = ['notice_period', 'clearance', 'completed', 'withdrawn'];
  const data = load();
  const record = data.exits.find(x => x.id === Number(req.params.id));
  if (!record) return res.status(404).json({ error: 'Exit record not found' });

  if (status) {
    if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    record.status = status;
    if (status === 'completed') {
      // Deactivate the employee once offboarding is fully complete
      const emp = data.employees.find(e => e.id === record.employee_id);
      if (emp) emp.status = 'inactive';
    }
  }
  if (confirmed_last_day !== undefined) record.confirmed_last_day = confirmed_last_day;
  if (clearance_notes !== undefined) record.clearance_notes = clearance_notes;

  data.audit_log.push({ id: nextId(data, 'audit_log'), actor_id: req.user.id, action: 'update_exit', target: req.params.id, details: status || null, created_at: new Date().toISOString() });
  save(data);
  res.json({ success: true });
});

// Estimated gratuity (End of Service) calculation using UAE Labour Law's standard formula:
// - Under 1 year of service: no gratuity
// - 1-5 years: 21 days of basic salary per year of service
// - Over 5 years: 21 days/year for the first 5 years, then 30 days/year after that
// This is an estimate based on basic salary only - always verify against current MOHRE rules
// and the employee's actual contract terms before final settlement.
router.get('/:id/gratuity', requireRole('admin', 'hr'), (req, res) => {
  const data = load();
  const record = data.exits.find(x => x.id === Number(req.params.id));
  if (!record) return res.status(404).json({ error: 'Exit record not found' });

  const emp = data.employees.find(e => e.id === record.employee_id);
  if (!emp || !emp.date_of_joining) {
    return res.status(400).json({ error: 'Employee record is missing a date of joining - cannot estimate gratuity' });
  }

  const latestPayroll = data.payroll
    .filter(p => p.employee_id === record.employee_id)
    .sort((a, b) => b.month.localeCompare(a.month))[0];
  if (!latestPayroll) {
    return res.status(400).json({ error: 'No payroll record found for this employee - cannot estimate gratuity' });
  }

  const lastDay = record.confirmed_last_day || record.requested_last_day;
  const startDate = new Date(emp.date_of_joining);
  const endDate = new Date(lastDay);
  const yearsOfService = (endDate - startDate) / (1000 * 60 * 60 * 24 * 365.25);
  const dailyWage = latestPayroll.basic / 30;

  let gratuityDays = 0;
  if (yearsOfService >= 5) {
    gratuityDays = (5 * 21) + ((yearsOfService - 5) * 30);
  } else if (yearsOfService >= 1) {
    gratuityDays = yearsOfService * 21;
  }
  const estimatedGratuity = Math.round(gratuityDays * dailyWage * 100) / 100;

  res.json({
    years_of_service: Math.round(yearsOfService * 100) / 100,
    basic_salary_used: latestPayroll.basic,
    estimated_gratuity: estimatedGratuity,
    note: 'Estimate only, based on basic salary and standard UAE Labour Law formula. Confirm against current MOHRE regulations and the employee\'s contract before final settlement.'
  });
});

module.exports = router;
