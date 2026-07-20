const express = require('express');
const { load, save, nextId } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const data = load();
  const empById = Object.fromEntries(data.employees.map(e => [e.id, e]));

  if (req.user.role === 'admin' || req.user.role === 'hr') {
    const { employee_id, month } = req.query;
    let rows = data.payroll;
    if (employee_id) rows = rows.filter(p => p.employee_id === Number(employee_id));
    if (month) rows = rows.filter(p => p.month === month);
    rows = rows.map(p => ({ ...p, full_name: empById[p.employee_id]?.full_name, employee_code: empById[p.employee_id]?.employee_code }));
    rows.sort((a, b) => b.month.localeCompare(a.month));
    return res.json(rows);
  }

  const rows = data.payroll.filter(p => p.employee_id === req.user.id).sort((a, b) => b.month.localeCompare(a.month));
  res.json(rows);
});

router.post('/', requireRole('admin', 'hr'), (req, res) => {
  const { employee_id, month, basic, allowances, deductions, status } = req.body;
  if (!employee_id || !month || basic == null) {
    return res.status(400).json({ error: 'employee_id, month, and basic are required' });
  }
  const net_pay = Number(basic) + Number(allowances || 0) - Number(deductions || 0);
  const data = load();

  let record = data.payroll.find(p => p.employee_id === Number(employee_id) && p.month === month);
  if (record) {
    record.basic = Number(basic);
    record.allowances = Number(allowances || 0);
    record.deductions = Number(deductions || 0);
    record.net_pay = net_pay;
    record.status = status || record.status;
  } else {
    record = {
      id: nextId(data, 'payroll'),
      employee_id: Number(employee_id),
      month,
      basic: Number(basic),
      allowances: Number(allowances || 0),
      deductions: Number(deductions || 0),
      net_pay,
      status: status || 'draft',
      generated_at: new Date().toISOString()
    };
    data.payroll.push(record);
  }

  data.audit_log.push({ id: nextId(data, 'audit_log'), actor_id: req.user.id, action: 'generate_payroll', target: `employee_id=${employee_id}`, details: `month=${month}`, created_at: new Date().toISOString() });
  save(data);

  res.json({ success: true, net_pay });
});

module.exports = router;
