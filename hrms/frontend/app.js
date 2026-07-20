const API = '/api';
let state = { token: localStorage.getItem('hrms_token') || null, user: null, brand: 'HRMS' };

async function loadBrand() {
  try {
    const data = await fetch(API + '/settings/brand').then(r => r.json());
    state.brand = data.brand_name || 'HRMS';
    document.title = state.brand;
    $('#brand-eyebrow').textContent = state.brand;
    $('#topbar-brand').innerHTML = `${state.brand}<span>.</span>`;
  } catch { /* fall back to defaults if this fails */ }
}

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.style.display = 'block';
  setTimeout(() => (t.style.display = 'none'), 2600);
}

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(opts.headers || {})
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ---------- Auth ----------
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#login-email').value.trim();
  const password = $('#login-password').value;
  $('#login-error').style.display = 'none';
  try {
    const data = await api('/auth/login', { method: 'POST', body: { email, password } });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('hrms_token', data.token);
    enterApp();
  } catch (err) {
    $('#login-error').textContent = err.message;
    $('#login-error').style.display = 'block';
  }
});

$('#logout-btn').addEventListener('click', () => {
  state = { token: null, user: null };
  localStorage.removeItem('hrms_token');
  $('#app-view').style.display = 'none';
  $('#login-view').style.display = 'flex';
});

async function tryAutoLogin() {
  if (!state.token) return;
  try {
    state.user = await api('/auth/me');
    enterApp();
  } catch {
    localStorage.removeItem('hrms_token');
  }
}

function enterApp() {
  $('#login-view').style.display = 'none';
  $('#app-view').style.display = 'block';
  $('#user-name').textContent = state.user.full_name;
  $('#user-role').textContent = state.user.role;
  buildSidebar();
  navigate(isAdmin() ? 'dashboard' : 'my-profile');
}

function isAdmin() { return state.user.role === 'admin' || state.user.role === 'hr'; }

// ---------- Navigation ----------
const NAV_ADMIN = [
  ['dashboard', 'Dashboard'],
  ['employees', 'Employees'],
  ['payroll', 'Payroll'],
  ['attendance', 'Attendance'],
  ['leave', 'Leave requests'],
  ['requests', 'Other requests']
];
const NAV_EMPLOYEE = [
  ['my-profile', 'My profile'],
  ['my-payroll', 'My payslips'],
  ['my-attendance', 'Attendance'],
  ['my-leave', 'Leave'],
  ['my-requests', 'Requests']
];

function buildSidebar() {
  const items = isAdmin() ? NAV_ADMIN : NAV_EMPLOYEE;
  $('#sidebar').innerHTML = items.map(([key, label], i) =>
    `<button data-key="${key}" class="${i === 0 ? 'active' : ''}">${label}</button>`
  ).join('');
  $$('#sidebar button').forEach(btn => btn.addEventListener('click', () => navigate(btn.dataset.key)));
}

function setActiveNav(key) {
  $$('#sidebar button').forEach(b => b.classList.toggle('active', b.dataset.key === key));
}

async function navigate(key) {
  setActiveNav(key);
  const content = $('#content');
  content.innerHTML = '<div class="empty-state">Loading…</div>';
  try {
    const renderers = {
      'dashboard': renderDashboard,
      'employees': renderEmployees,
      'payroll': renderPayroll,
      'attendance': renderAttendance,
      'leave': renderLeaveAdmin,
      'requests': renderRequestsAdmin,
      'my-profile': renderMyProfile,
      'my-payroll': renderMyPayroll,
      'my-attendance': renderMyAttendance,
      'my-leave': renderMyLeave,
      'my-requests': renderMyRequests
    };
    await renderers[key]();
  } catch (err) {
    content.innerHTML = `<div class="empty-state">Couldn't load this view: ${err.message}</div>`;
  }
}

function money(n) { return '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function statusTag(status) {
  const map = { active: 'green', approved: 'green', paid: 'green', present: 'green', completed: 'green',
    pending: 'amber', draft: 'amber', 'half-day': 'amber', in_progress: 'amber',
    rejected: 'red', inactive: 'red', absent: 'red',
    processed: 'gray', wfh: 'gray' };
  return `<span class="tag tag-${map[status] || 'gray'}">${status}</span>`;
}

function openModal(html) {
  $('#modal-body').innerHTML = html;
  $('#modal-backdrop').style.display = 'flex';
}
function closeModal() { $('#modal-backdrop').style.display = 'none'; }
$('#modal-backdrop').addEventListener('click', (e) => { if (e.target.id === 'modal-backdrop') closeModal(); });

// ---------- Admin: Dashboard ----------
async function renderDashboard() {
  const [employees, leaveReqs] = await Promise.all([api('/employees'), api('/leave')]);
  const active = employees.filter(e => e.status === 'active').length;
  const pendingLeave = leaveReqs.filter(l => l.status === 'pending').length;
  const today = new Date().toISOString().slice(0, 10);
  const attendanceToday = await api(`/attendance?from=${today}&to=${today}`);

  $('#content').innerHTML = `
    <h2>Dashboard</h2>
    <p class="section-sub">Overview across all employees and modules.</p>
    <div class="stat-row">
      <div class="stat"><div class="num">${active}</div><div class="label">Active employees</div></div>
      <div class="stat"><div class="num">${attendanceToday.length}</div><div class="label">Checked in today</div></div>
      <div class="stat"><div class="num">${pendingLeave}</div><div class="label">Pending leave requests</div></div>
    </div>
    <div class="card">
      <h3 style="margin-top:0;">Recent leave requests</h3>
      ${renderLeaveTable(leaveReqs.slice(0, 5), false)}
    </div>
  `;
}

// ---------- Admin: Employees ----------
async function renderEmployees() {
  const employees = await api('/employees');
  $('#content').innerHTML = `
    <h2>Employees</h2>
    <p class="section-sub">${employees.length} employee record${employees.length === 1 ? '' : 's'}.</p>
    <button class="btn-add" id="add-employee-btn">+ Add employee</button>
    <div class="card" style="padding:0;">
      <table>
        <thead><tr><th>Code</th><th>Name</th><th>Email</th><th>Department</th><th>Role</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${employees.map(e => `
            <tr>
              <td class="mono">${e.employee_code}</td>
              <td>${e.full_name}</td>
              <td>${e.email}</td>
              <td>${e.department || '—'}</td>
              <td>${e.role}</td>
              <td>${statusTag(e.status)}</td>
              <td><button class="btn-small edit-emp" data-id="${e.id}">Edit</button></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
  $('#add-employee-btn').addEventListener('click', () => openEmployeeForm());
  $$('.edit-emp').forEach(b => b.addEventListener('click', () => {
    const emp = employees.find(x => x.id === Number(b.dataset.id));
    openEmployeeForm(emp);
  }));
}

function openEmployeeForm(emp) {
  const isEdit = !!emp;
  openModal(`
    <h3>${isEdit ? 'Edit employee' : 'Add employee'}</h3>
    <form id="emp-form">
      ${!isEdit ? `
        <label>Employee code</label><input name="employee_code" required>
        <label>Email</label><input name="email" type="email" required>
        <label>Temporary password</label><input name="password" type="password" minlength="8" required>
      ` : ''}
      <label>Full name</label><input name="full_name" value="${emp?.full_name || ''}" required>
      <label>Department</label><input name="department" value="${emp?.department || ''}">
      <label>Designation</label><input name="designation" value="${emp?.designation || ''}">
      <label>Date of joining</label><input name="date_of_joining" type="date" value="${emp?.date_of_joining || ''}">
      <label>Phone</label><input name="phone" value="${emp?.phone || ''}">
      <label>Role</label>
      <select name="role" style="width:100%; padding:11px 12px; border:1px solid var(--line); border-radius:3px; margin-bottom:18px;">
        <option value="employee" ${emp?.role === 'employee' ? 'selected' : ''}>Employee</option>
        <option value="hr" ${emp?.role === 'hr' ? 'selected' : ''}>HR</option>
        <option value="admin" ${emp?.role === 'admin' ? 'selected' : ''}>Admin</option>
      </select>
      ${isEdit ? `
        <label>Status</label>
        <select name="status" style="width:100%; padding:11px 12px; border:1px solid var(--line); border-radius:3px; margin-bottom:18px;">
          <option value="active" ${emp.status === 'active' ? 'selected' : ''}>Active</option>
          <option value="inactive" ${emp.status === 'inactive' ? 'selected' : ''}>Inactive</option>
        </select>
      ` : ''}
      <div class="btn-row">
        <button type="submit" class="btn-small" style="padding:10px 18px;">Save</button>
        <button type="button" class="btn-secondary" id="cancel-modal">Cancel</button>
      </div>
    </form>
  `);
  $('#cancel-modal').addEventListener('click', closeModal);
  $('#emp-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    try {
      if (isEdit) {
        await api(`/employees/${emp.id}`, { method: 'PUT', body: fd });
      } else {
        await api('/employees', { method: 'POST', body: fd });
      }
      closeModal();
      toast('Saved');
      navigate('employees');
    } catch (err) { toast(err.message); }
  });
}

// ---------- Admin: Payroll ----------
async function renderPayroll() {
  const [payroll, employees] = await Promise.all([api('/payroll'), api('/employees')]);
  $('#content').innerHTML = `
    <h2>Payroll</h2>
    <p class="section-sub">Generate and review monthly pay records.</p>
    <button class="btn-add" id="add-payroll-btn">+ Generate payroll</button>
    <div class="card" style="padding:0;">
      <table>
        <thead><tr><th>Employee</th><th>Month</th><th>Basic</th><th>Allowances</th><th>Deductions</th><th>Net pay</th><th>Status</th></tr></thead>
        <tbody>
          ${payroll.map(p => `
            <tr>
              <td>${p.full_name}</td>
              <td class="mono">${p.month}</td>
              <td>${money(p.basic)}</td>
              <td>${money(p.allowances)}</td>
              <td>${money(p.deductions)}</td>
              <td><strong>${money(p.net_pay)}</strong></td>
              <td>${statusTag(p.status)}</td>
            </tr>`).join('') || `<tr><td colspan="7" class="empty-state">No payroll records yet.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
  $('#add-payroll-btn').addEventListener('click', () => {
    openModal(`
      <h3>Generate payroll</h3>
      <form id="payroll-form">
        <label>Employee</label>
        <select name="employee_id" required style="width:100%; padding:11px 12px; border:1px solid var(--line); border-radius:3px; margin-bottom:18px;">
          ${employees.map(e => `<option value="${e.id}">${e.full_name} (${e.employee_code})</option>`).join('')}
        </select>
        <label>Month</label><input name="month" type="month" required>
        <label>Basic</label><input name="basic" type="number" step="0.01" required>
        <label>Allowances</label><input name="allowances" type="number" step="0.01" value="0">
        <label>Deductions</label><input name="deductions" type="number" step="0.01" value="0">
        <div class="btn-row">
          <button type="submit" class="btn-small" style="padding:10px 18px;">Generate</button>
          <button type="button" class="btn-secondary" id="cancel-modal">Cancel</button>
        </div>
      </form>
    `);
    $('#cancel-modal').addEventListener('click', closeModal);
    $('#payroll-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      try {
        await api('/payroll', { method: 'POST', body: fd });
        closeModal();
        toast('Payroll generated');
        navigate('payroll');
      } catch (err) { toast(err.message); }
    });
  });
}

// ---------- Admin: Attendance ----------
async function renderAttendance() {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await api(`/attendance?from=${today}&to=${today}`);
  $('#content').innerHTML = `
    <h2>Attendance</h2>
    <p class="section-sub">Today's check-ins across the organization.</p>
    <div class="card" style="padding:0;">
      <table>
        <thead><tr><th>Employee</th><th>Date</th><th>Check in</th><th>Check out</th><th>Status</th></tr></thead>
        <tbody>
          ${rows.map(a => `
            <tr>
              <td>${a.full_name}</td>
              <td class="mono">${a.date}</td>
              <td>${a.check_in ? new Date(a.check_in).toLocaleTimeString() : '—'}</td>
              <td>${a.check_out ? new Date(a.check_out).toLocaleTimeString() : '—'}</td>
              <td>${statusTag(a.status)}</td>
            </tr>`).join('') || `<tr><td colspan="5" class="empty-state">No check-ins yet today.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

// ---------- Admin: Leave review ----------
function renderLeaveTable(rows, withActions = true, showEmployee = true) {
  const cols = (showEmployee ? 1 : 0) + 4 + (withActions ? 1 : 0);
  return `
    <table>
      <thead><tr>${showEmployee ? '<th>Employee</th>' : ''}<th>Type</th><th>From</th><th>To</th><th>Status</th>${withActions ? '<th></th>' : ''}</tr></thead>
      <tbody>
        ${rows.map(l => `
          <tr>
            ${showEmployee ? `<td>${l.full_name}</td>` : ''}
            <td>${l.leave_type}</td>
            <td class="mono">${l.start_date}</td>
            <td class="mono">${l.end_date}</td>
            <td>${statusTag(l.status)}</td>
            ${withActions ? `<td>
              ${l.status === 'pending' ? `
                <button class="btn-small approve-leave" data-id="${l.id}">Approve</button>
                <button class="btn-small reject reject-leave" data-id="${l.id}">Reject</button>
              ` : ''}
            </td>` : ''}
          </tr>`).join('') || `<tr><td colspan="${cols}" class="empty-state">No leave requests.</td></tr>`}
      </tbody>
    </table>
  `;
}

async function renderLeaveAdmin() {
  const rows = await api('/leave');
  $('#content').innerHTML = `
    <h2>Leave requests</h2>
    <p class="section-sub">Review and approve employee leave.</p>
    <div class="card" style="padding:0;">${renderLeaveTable(rows, true)}</div>
  `;
  $$('.approve-leave').forEach(b => b.addEventListener('click', () => reviewLeave(b.dataset.id, 'approved')));
  $$('.reject-leave').forEach(b => b.addEventListener('click', () => reviewLeave(b.dataset.id, 'rejected')));
}

async function reviewLeave(id, status) {
  try {
    await api(`/leave/${id}`, { method: 'PUT', body: { status } });
    toast(`Leave ${status}`);
    navigate('leave');
  } catch (err) { toast(err.message); }
}

// ---------- Requests module ----------
const REQUEST_LABELS = {
  salary_certificate: 'Salary certificate',
  experience_letter: 'Experience letter',
  id_reissue: 'ID card reissue',
  reimbursement: 'Reimbursement',
  other: 'Other'
};

async function renderRequestsAdmin() {
  const rows = await api('/requests');
  $('#content').innerHTML = `
    <h2>Other requests</h2>
    <p class="section-sub">Salary certificates, letters, reimbursements, and other employee requests.</p>
    <div class="card" style="padding:0;">
      <table>
        <thead><tr><th>Employee</th><th>Type</th><th>Details</th><th>Status</th><th>Submitted</th><th></th></tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td>${r.full_name} <span class="mono" style="color:var(--muted); font-size:12px;">(${r.employee_code})</span></td>
              <td>${REQUEST_LABELS[r.request_type] || r.request_type}</td>
              <td>${r.details || '—'}</td>
              <td>${statusTag(r.status)}</td>
              <td class="mono">${r.created_at.slice(0, 10)}</td>
              <td><button class="btn-small manage-request" data-id="${r.id}">Manage</button></td>
            </tr>`).join('') || `<tr><td colspan="6" class="empty-state">No requests submitted yet.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
  $$('.manage-request').forEach(b => b.addEventListener('click', () => {
    const r = rows.find(x => x.id === Number(b.dataset.id));
    openModal(`
      <h3>${REQUEST_LABELS[r.request_type] || r.request_type}</h3>
      <p style="color:var(--muted); font-size:13.5px; margin-top:-10px;">From ${r.full_name} · ${r.created_at.slice(0, 10)}</p>
      <p style="font-size:14px;">${r.details || 'No additional details provided.'}</p>
      <form id="request-review-form">
        <label>Status</label>
        <select name="status" style="width:100%; padding:11px 12px; border:1px solid var(--line); border-radius:3px; margin-bottom:18px;">
          <option value="pending" ${r.status === 'pending' ? 'selected' : ''}>Pending</option>
          <option value="in_progress" ${r.status === 'in_progress' ? 'selected' : ''}>In progress</option>
          <option value="completed" ${r.status === 'completed' ? 'selected' : ''}>Completed</option>
          <option value="rejected" ${r.status === 'rejected' ? 'selected' : ''}>Rejected</option>
        </select>
        <label>Note to employee</label><input name="admin_note" value="${r.admin_note || ''}">
        <div class="btn-row">
          <button type="submit" class="btn-small" style="padding:10px 18px;">Save</button>
          <button type="button" class="btn-secondary" id="cancel-modal">Cancel</button>
        </div>
      </form>
    `);
    $('#cancel-modal').addEventListener('click', closeModal);
    $('#request-review-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      try {
        await api(`/requests/${r.id}`, { method: 'PUT', body: fd });
        closeModal();
        toast('Updated');
        navigate('requests');
      } catch (err) { toast(err.message); }
    });
  }));
}

async function renderMyRequests() {
  const rows = await api('/requests');
  $('#content').innerHTML = `
    <h2>Requests</h2>
    <p class="section-sub">Ask HR for a salary certificate, letter, reimbursement, or anything else.</p>
    <button class="btn-add" id="add-request-btn">+ New request</button>
    <div class="card" style="padding:0;">
      <table>
        <thead><tr><th>Type</th><th>Details</th><th>Status</th><th>HR note</th><th>Submitted</th></tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td>${REQUEST_LABELS[r.request_type] || r.request_type}</td>
              <td>${r.details || '—'}</td>
              <td>${statusTag(r.status)}</td>
              <td>${r.admin_note || '—'}</td>
              <td class="mono">${r.created_at.slice(0, 10)}</td>
            </tr>`).join('') || `<tr><td colspan="5" class="empty-state">No requests submitted yet.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
  $('#add-request-btn').addEventListener('click', () => {
    openModal(`
      <h3>New request</h3>
      <form id="new-request-form">
        <label>Request type</label>
        <select name="request_type" style="width:100%; padding:11px 12px; border:1px solid var(--line); border-radius:3px; margin-bottom:18px;">
          ${Object.entries(REQUEST_LABELS).map(([val, label]) => `<option value="${val}">${label}</option>`).join('')}
        </select>
        <label>Details (optional)</label><input name="details" placeholder="e.g. needed for visa application">
        <div class="btn-row">
          <button type="submit" class="btn-small" style="padding:10px 18px;">Submit</button>
          <button type="button" class="btn-secondary" id="cancel-modal">Cancel</button>
        </div>
      </form>
    `);
    $('#cancel-modal').addEventListener('click', closeModal);
    $('#new-request-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      try {
        await api('/requests', { method: 'POST', body: fd });
        closeModal();
        toast('Request submitted');
        navigate('my-requests');
      } catch (err) { toast(err.message); }
    });
  });
}

// ---------- Employee: My profile ----------
async function renderMyProfile() {
  const me = await api(`/employees/${state.user.id}`);
  $('#content').innerHTML = `
    <h2>My profile</h2>
    <p class="section-sub">Your record on file. Contact HR to update most fields.</p>
    <div class="card">
      <div class="form-grid">
        <div><label>Employee code</label><p class="mono">${me.employee_code}</p></div>
        <div><label>Full name</label><p>${me.full_name}</p></div>
        <div><label>Email</label><p>${me.email}</p></div>
        <div><label>Department</label><p>${me.department || '—'}</p></div>
        <div><label>Designation</label><p>${me.designation || '—'}</p></div>
        <div><label>Date of joining</label><p>${me.date_of_joining || '—'}</p></div>
      </div>
      <form id="phone-form">
        <label>Phone</label><input name="phone" value="${me.phone || ''}">
        <button type="submit" class="btn-small" style="padding:9px 16px;">Update phone</button>
      </form>
    </div>
  `;
  $('#phone-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    await api(`/employees/${me.id}`, { method: 'PUT', body: fd });
    toast('Updated');
  });
}

// ---------- Employee: My payroll ----------
async function renderMyPayroll() {
  const rows = await api('/payroll');
  $('#content').innerHTML = `
    <h2>My payslips</h2>
    <p class="section-sub">Only visible to you.</p>
    <div class="card" style="padding:0;">
      <table>
        <thead><tr><th>Month</th><th>Basic</th><th>Allowances</th><th>Deductions</th><th>Net pay</th><th>Status</th></tr></thead>
        <tbody>
          ${rows.map(p => `
            <tr>
              <td class="mono">${p.month}</td>
              <td>${money(p.basic)}</td>
              <td>${money(p.allowances)}</td>
              <td>${money(p.deductions)}</td>
              <td><strong>${money(p.net_pay)}</strong></td>
              <td>${statusTag(p.status)}</td>
            </tr>`).join('') || `<tr><td colspan="6" class="empty-state">No payslips yet.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

// ---------- Employee: Attendance ----------
async function renderMyAttendance() {
  const rows = await api('/attendance');
  const today = new Date().toISOString().slice(0, 10);
  const todays = rows.find(a => a.date === today);
  $('#content').innerHTML = `
    <h2>Attendance</h2>
    <p class="section-sub">Check in and out for today, and review your history.</p>
    <div class="card">
      <div class="btn-row">
        <button class="btn-small" id="checkin-btn" ${todays?.check_in ? 'disabled' : ''}>Check in</button>
        <button class="btn-small" id="checkout-btn" ${!todays?.check_in || todays?.check_out ? 'disabled' : ''}>Check out</button>
      </div>
    </div>
    <div class="card" style="padding:0;">
      <table>
        <thead><tr><th>Date</th><th>Check in</th><th>Check out</th><th>Status</th></tr></thead>
        <tbody>
          ${rows.map(a => `
            <tr>
              <td class="mono">${a.date}</td>
              <td>${a.check_in ? new Date(a.check_in).toLocaleTimeString() : '—'}</td>
              <td>${a.check_out ? new Date(a.check_out).toLocaleTimeString() : '—'}</td>
              <td>${statusTag(a.status)}</td>
            </tr>`).join('') || `<tr><td colspan="4" class="empty-state">No attendance history yet.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
  $('#checkin-btn').addEventListener('click', async () => {
    try { await api('/attendance/check-in', { method: 'POST' }); toast('Checked in'); navigate('my-attendance'); }
    catch (err) { toast(err.message); }
  });
  $('#checkout-btn').addEventListener('click', async () => {
    try { await api('/attendance/check-out', { method: 'POST' }); toast('Checked out'); navigate('my-attendance'); }
    catch (err) { toast(err.message); }
  });
}

// ---------- Employee: Leave ----------
async function renderMyLeave() {
  const rows = await api('/leave');
  $('#content').innerHTML = `
    <h2>Leave</h2>
    <p class="section-sub">Submit a request and track its status.</p>
    <button class="btn-add" id="add-leave-btn">+ Request leave</button>
    <div class="card" style="padding:0;">${renderLeaveTable(rows, false, false)}</div>
  `;
  $('#add-leave-btn').addEventListener('click', () => {
    openModal(`
      <h3>Request leave</h3>
      <form id="leave-form">
        <label>Leave type</label>
        <select name="leave_type" style="width:100%; padding:11px 12px; border:1px solid var(--line); border-radius:3px; margin-bottom:18px;">
          <option value="casual">Casual</option>
          <option value="sick">Sick</option>
          <option value="earned">Earned</option>
          <option value="unpaid">Unpaid</option>
        </select>
        <label>Start date</label><input name="start_date" type="date" required>
        <label>End date</label><input name="end_date" type="date" required>
        <label>Reason</label><input name="reason">
        <div class="btn-row">
          <button type="submit" class="btn-small" style="padding:10px 18px;">Submit</button>
          <button type="button" class="btn-secondary" id="cancel-modal">Cancel</button>
        </div>
      </form>
    `);
    $('#cancel-modal').addEventListener('click', closeModal);
    $('#leave-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      try {
        await api('/leave', { method: 'POST', body: fd });
        closeModal();
        toast('Leave request submitted');
        navigate('my-leave');
      } catch (err) { toast(err.message); }
    });
  });
}

loadBrand();
tryAutoLogin();
