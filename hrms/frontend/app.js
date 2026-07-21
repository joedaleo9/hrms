const API = '/api';
let state = { token: localStorage.getItem('hrms_token') || null, user: null, brand: 'HRMS' };

async function loadBrand() {
  try {
    const data = await fetch(API + '/settings/brand').then(r => r.json());
    state.brand = data.brand_name || 'HRMS';
    document.title = state.brand;
    $('#brand-eyebrow').textContent = state.brand;
    $('#topbar-brand').innerHTML = `${state.brand}<span>.</span>`;
    if (data.logo_url) {
      const logo = $('#login-logo');
      logo.src = data.logo_url;
      logo.alt = state.brand;
      logo.style.display = 'block';
    }
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

$('#forgot-password-link').addEventListener('click', () => {
  openModal(`
    <h3>Forgot password?</h3>
    <form id="forgot-lookup-form">
      <label>Your email</label><input name="email" type="email" required>
      <div id="forgot-lookup-error" style="color:var(--rust); font-size:13px; margin-bottom:14px; display:none;"></div>
      <div class="btn-row">
        <button type="submit" class="btn-small" style="padding:10px 18px;">Continue</button>
        <button type="button" class="btn-secondary" id="cancel-modal">Cancel</button>
      </div>
    </form>
  `);
  $('#cancel-modal').addEventListener('click', closeModal);
  $('#forgot-lookup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#forgot-lookup-form input[name="email"]').value.trim();
    const errorEl = $('#forgot-lookup-error');
    errorEl.style.display = 'none';
    try {
      const result = await fetch(API + '/auth/forgot-password/lookup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email })
      }).then(r => r.json());

      if (!result.has_question) {
        openModal(`
          <h3>No security question set</h3>
          <p style="font-size:14px; color:var(--ink); line-height:1.6;">
            This account hasn't set up a security question yet, so a self-service reset isn't possible.
            Please contact your HR or system administrator to reset your password.
          </p>
          <div class="btn-row">
            <button type="button" class="btn-secondary" id="cancel-modal">Close</button>
          </div>
        `);
        $('#cancel-modal').addEventListener('click', closeModal);
        return;
      }

      openModal(`
        <h3>Answer your security question</h3>
        <p style="font-size:14px; color:var(--ink);">${result.question}</p>
        <form id="forgot-reset-form">
          <label>Your answer</label><input name="answer" required>
          <label>New password</label><input name="newPassword" type="password" minlength="8" required>
          <div id="forgot-reset-error" style="color:var(--rust); font-size:13px; margin-bottom:14px; display:none;"></div>
          <div class="btn-row">
            <button type="submit" class="btn-small" style="padding:10px 18px;">Reset password</button>
            <button type="button" class="btn-secondary" id="cancel-modal">Cancel</button>
          </div>
        </form>
      `);
      $('#cancel-modal').addEventListener('click', closeModal);
      $('#forgot-reset-form').addEventListener('submit', async (e2) => {
        e2.preventDefault();
        const fd = Object.fromEntries(new FormData(e2.target));
        const resetErrorEl = $('#forgot-reset-error');
        resetErrorEl.style.display = 'none';
        try {
          const res = await fetch(API + '/auth/forgot-password/reset', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, answer: fd.answer, newPassword: fd.newPassword })
          }).then(r => r.json().then(body => ({ ok: r.ok, body })));
          if (!res.ok) throw new Error(res.body.error || 'Something went wrong');
          closeModal();
          toast('Password reset — you can log in now');
        } catch (err) {
          resetErrorEl.textContent = err.message;
          resetErrorEl.style.display = 'block';
        }
      });
    } catch (err) {
      errorEl.textContent = 'Something went wrong. Please try again.';
      errorEl.style.display = 'block';
    }
  });
});

$('#change-password-btn').addEventListener('click', () => {
  openModal(`
    <h3>Change password</h3>
    <form id="change-password-form">
      <label>Current password</label><input name="currentPassword" type="password" required>
      <label>New password</label><input name="newPassword" type="password" minlength="8" required>
      <label>Confirm new password</label><input name="confirmPassword" type="password" minlength="8" required>
      <div id="change-password-error" style="color:var(--rust); font-size:13px; margin-bottom:14px; display:none;"></div>
      <div class="btn-row">
        <button type="submit" class="btn-small" style="padding:10px 18px;">Update password</button>
        <button type="button" class="btn-secondary" id="cancel-modal">Cancel</button>
      </div>
    </form>
  `);
  $('#cancel-modal').addEventListener('click', closeModal);
  $('#change-password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    const errorEl = $('#change-password-error');
    errorEl.style.display = 'none';
    if (fd.newPassword !== fd.confirmPassword) {
      errorEl.textContent = "New password and confirmation don't match.";
      errorEl.style.display = 'block';
      return;
    }
    try {
      await api('/auth/change-password', { method: 'POST', body: { currentPassword: fd.currentPassword, newPassword: fd.newPassword } });
      closeModal();
      toast('Password updated');
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  });
});

$('#security-question-btn').addEventListener('click', () => {
  openModal(`
    <h3>Security question</h3>
    <p style="font-size:13px; color:var(--muted); margin-top:-10px;">
      Set this up so you can reset your own password later from the login screen, without needing HR.
    </p>
    <form id="security-question-form">
      <label>Question</label><input name="question" required placeholder="e.g. What was your first pet's name?">
      <label>Answer</label><input name="answer" required>
      <p style="font-size:12px; color:var(--muted); margin-top:-10px;">Answers aren't case-sensitive.</p>
      <div id="security-question-error" style="color:var(--rust); font-size:13px; margin-bottom:14px; display:none;"></div>
      <div class="btn-row">
        <button type="submit" class="btn-small" style="padding:10px 18px;">Save</button>
        <button type="button" class="btn-secondary" id="cancel-modal">Cancel</button>
      </div>
    </form>
  `);
  $('#cancel-modal').addEventListener('click', closeModal);
  $('#security-question-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    const errorEl = $('#security-question-error');
    errorEl.style.display = 'none';
    try {
      await api('/auth/security-question', { method: 'POST', body: fd });
      closeModal();
      toast('Security question saved');
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  });
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
  ['requests', 'Other requests'],
  ['loans', 'Loans & advances'],
  ['documents', 'Documents'],
  ['assets', 'Assets'],
  ['grades', 'Grades'],
  ['recruitment', 'Recruitment'],
  ['exits', 'Employee exits']
];
const NAV_EMPLOYEE = [
  ['my-profile', 'My profile'],
  ['my-payroll', 'My payslips'],
  ['my-attendance', 'Attendance'],
  ['my-leave', 'Leave'],
  ['my-requests', 'Requests'],
  ['my-loans', 'Loans & advances'],
  ['my-exit', 'Resignation']
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
      'recruitment': renderRecruitment,
      'exits': renderExitsAdmin,
      'loans': renderLoansAdmin,
      'documents': renderDocumentsAdmin,
      'assets': renderAssetsAdmin,
      'grades': renderGradesAdmin,
      'my-profile': renderMyProfile,
      'my-payroll': renderMyPayroll,
      'my-attendance': renderMyAttendance,
      'my-leave': renderMyLeave,
      'my-requests': renderMyRequests,
      'my-loans': renderMyLoans,
      'my-exit': renderMyExit
    };
    await renderers[key]();
  } catch (err) {
    content.innerHTML = `<div class="empty-state">Couldn't load this view: ${err.message}</div>`;
  }
}

function money(n) { return '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function statusTag(status) {
  const map = { active: 'green', approved: 'green', paid: 'green', present: 'green', completed: 'green',
    open: 'green', hired: 'green', offer: 'green', allocated: 'green', repaid: 'green',
    pending: 'amber', draft: 'amber', 'half-day': 'amber', in_progress: 'amber',
    interview: 'amber', notice_period: 'amber', clearance: 'amber', on_hold: 'amber',
    rejected: 'red', inactive: 'red', absent: 'red', closed: 'red', withdrawn: 'red',
    processed: 'gray', wfh: 'gray', applied: 'gray', returned: 'gray' };
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
  const [employees, leaveReqs, expiringDocs] = await Promise.all([api('/employees'), api('/leave'), api('/documents/expiring?days=60')]);
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
      <div class="stat" style="${expiringDocs.length ? 'border-left-color:var(--rust);' : ''}"><div class="num">${expiringDocs.length}</div><div class="label">Documents expiring soon</div></div>
    </div>
    <div class="card">
      ${expiringDocs.length ? `
        <h3 style="margin-top:0;">⚠ Documents expiring within 60 days</h3>
        <table>
          <thead><tr><th>Employee</th><th>Document</th><th>Expiry date</th></tr></thead>
          <tbody>
            ${expiringDocs.slice(0, 5).map(d => `<tr><td>${d.full_name}</td><td>${DOC_LABELS[d.doc_type]}</td><td class="mono">${d.is_expired ? '<strong style="color:var(--rust);">Expired</strong> — ' : ''}${d.expiry_date}</td></tr>`).join('')}
          </tbody>
        </table>
      ` : '<p style="margin:0; color:var(--muted); font-size:13.5px;">No documents expiring in the next 60 days.</p>'}
    </div>
    <div class="card">
      <h3 style="margin-top:0;">Headcount by vertical</h3>
      <table>
        <thead><tr><th>Vertical / department</th><th>Active employees</th></tr></thead>
        <tbody>
          ${Object.entries(employees.filter(e => e.status === 'active').reduce((acc, e) => {
            const key = e.department || 'Unassigned';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
          }, {})).sort((a, b) => b[1] - a[1]).map(([dept, count]) => `
            <tr><td>${dept}</td><td>${count}</td></tr>
          `).join('') || `<tr><td colspan="2" class="empty-state">No active employees yet.</td></tr>`}
        </tbody>
      </table>
    </div>
    <div class="card">
      <h3 style="margin-top:0;">Recent leave requests</h3>
      ${renderLeaveTable(leaveReqs.slice(0, 5), false)}
    </div>
    <div class="card">
      <h3 style="margin-top:0;">Branding</h3>
      <p class="section-sub" style="margin-bottom:14px;">Set the name and logo shown on the login screen.</p>
      <button class="btn-secondary" id="edit-branding-btn">Edit branding</button>
    </div>
  `;
  $('#edit-branding-btn').addEventListener('click', openBrandingForm);
}

async function openBrandingForm() {
  const current = await fetch(API + '/settings/brand').then(r => r.json());
  openModal(`
    <h3>Branding</h3>
    <form id="branding-form">
      <label>Company / brand name</label><input name="brand_name" value="${current.brand_name || ''}" required>
      <label>Logo image URL (optional)</label><input name="logo_url" value="${current.logo_url || ''}" placeholder="https://...">
      <p style="font-size:12.5px; color:var(--muted); margin-top:-10px;">Paste a direct link to an image file (e.g. hosted on your website or a service like Imgur). Leave blank to just show the brand name as text.</p>
      <div class="btn-row">
        <button type="submit" class="btn-small" style="padding:10px 18px;">Save</button>
        <button type="button" class="btn-secondary" id="cancel-modal">Cancel</button>
      </div>
    </form>
  `);
  $('#cancel-modal').addEventListener('click', closeModal);
  $('#branding-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    try {
      await api('/settings/brand', { method: 'PUT', body: fd });
      closeModal();
      toast('Branding updated');
      loadBrand();
      navigate('dashboard');
    } catch (err) { toast(err.message); }
  });
}

// ---------- Admin: Employees ----------
async function renderEmployees() {
  const employees = await api('/employees');
  const departments = [...new Set(employees.map(e => e.department).filter(Boolean))].sort();

  function renderRows(list) {
    return list.map(e => `
      <tr>
        <td class="mono">${e.employee_code}</td>
        <td>${e.full_name}</td>
        <td>${e.email}</td>
        <td>${e.department || '—'}</td>
        <td>${e.role}</td>
        <td>${statusTag(e.status)}</td>
        <td><button class="btn-small edit-emp" data-id="${e.id}">Edit</button></td>
      </tr>`).join('') || `<tr><td colspan="7" class="empty-state">No employees match this filter.</td></tr>`;
  }

  $('#content').innerHTML = `
    <h2>Employees</h2>
    <p class="section-sub">${employees.length} employee record${employees.length === 1 ? '' : 's'}.</p>
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
      <button class="btn-add" id="add-employee-btn" style="margin-bottom:0;">+ Add employee</button>
      ${departments.length ? `
        <select id="department-filter" style="padding:9px 12px; border:1px solid var(--line); border-radius:3px; font-size:13px;">
          <option value="">All verticals/departments</option>
          ${departments.map(d => `<option value="${d}">${d}</option>`).join('')}
        </select>
      ` : ''}
    </div>
    <div class="card" style="padding:0;">
      <table>
        <thead><tr><th>Code</th><th>Name</th><th>Email</th><th>Department</th><th>Role</th><th>Status</th><th></th></tr></thead>
        <tbody id="employees-tbody">${renderRows(employees)}</tbody>
      </table>
    </div>
  `;
  $('#add-employee-btn').addEventListener('click', () => openEmployeeForm());
  $$('.edit-emp').forEach(b => b.addEventListener('click', () => {
    const emp = employees.find(x => x.id === Number(b.dataset.id));
    openEmployeeForm(emp);
  }));

  const filterEl = $('#department-filter');
  if (filterEl) {
    filterEl.addEventListener('change', () => {
      const filtered = filterEl.value ? employees.filter(e => e.department === filterEl.value) : employees;
      $('#employees-tbody').innerHTML = renderRows(filtered);
      $$('.edit-emp').forEach(b => b.addEventListener('click', () => {
        const emp = employees.find(x => x.id === Number(b.dataset.id));
        openEmployeeForm(emp);
      }));
    });
  }
}

async function openEmployeeForm(emp) {
  const isEdit = !!emp;
  const grades = await api('/grades').catch(() => []);
  openModal(`
    <h3>${isEdit ? 'Edit employee' : 'Add employee'}</h3>
    <form id="emp-form">
      ${!isEdit ? `
        <label>Employee code</label><input name="employee_code" required>
        <label>Email</label><input name="email" type="email" required>
        <label>Temporary password</label><input name="password" type="password" minlength="8" required>
      ` : ''}
      <label>Full name</label><input name="full_name" value="${emp?.full_name || ''}" required>
      <label>Department / vertical</label><input name="department" value="${emp?.department || ''}">
      <label>Designation</label><input name="designation" value="${emp?.designation || ''}">
      <label>Date of joining</label><input name="date_of_joining" type="date" value="${emp?.date_of_joining || ''}">
      <label>Phone</label><input name="phone" value="${emp?.phone || ''}">
      <label>Grade</label>
      <select name="grade" style="width:100%; padding:11px 12px; border:1px solid var(--line); border-radius:3px; margin-bottom:18px;">
        <option value="">No grade set</option>
        ${grades.map(g => `<option value="${g.name}" ${emp?.grade === g.name ? 'selected' : ''}>${g.name}</option>`).join('')}
      </select>
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
        <thead><tr><th>Employee</th><th>Type</th><th>Amount</th><th>Details</th><th>Status</th><th>Submitted</th><th></th></tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td>${r.full_name} <span class="mono" style="color:var(--muted); font-size:12px;">(${r.employee_code})</span></td>
              <td>${REQUEST_LABELS[r.request_type] || r.request_type}</td>
              <td>${r.amount != null ? money(r.amount) : '—'}</td>
              <td>${r.details || '—'}</td>
              <td>${statusTag(r.status)}</td>
              <td class="mono">${r.created_at.slice(0, 10)}</td>
              <td><button class="btn-small manage-request" data-id="${r.id}">Manage</button></td>
            </tr>`).join('') || `<tr><td colspan="7" class="empty-state">No requests submitted yet.</td></tr>`}
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
        <thead><tr><th>Type</th><th>Amount</th><th>Details</th><th>Status</th><th>HR note</th><th>Submitted</th></tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td>${REQUEST_LABELS[r.request_type] || r.request_type}</td>
              <td>${r.amount != null ? money(r.amount) : '—'}</td>
              <td>${r.details || '—'}</td>
              <td>${statusTag(r.status)}</td>
              <td>${r.admin_note || '—'}</td>
              <td class="mono">${r.created_at.slice(0, 10)}</td>
            </tr>`).join('') || `<tr><td colspan="6" class="empty-state">No requests submitted yet.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
  $('#add-request-btn').addEventListener('click', () => {
    openModal(`
      <h3>New request</h3>
      <form id="new-request-form">
        <label>Request type</label>
        <select name="request_type" id="request-type-select" style="width:100%; padding:11px 12px; border:1px solid var(--line); border-radius:3px; margin-bottom:18px;">
          ${Object.entries(REQUEST_LABELS).map(([val, label]) => `<option value="${val}">${label}</option>`).join('')}
        </select>
        <div id="amount-field-wrap" style="display:none;">
          <label>Amount</label><input name="amount" type="number" step="0.01">
        </div>
        <label>Details (optional)</label><input name="details" placeholder="e.g. needed for visa application">
        <div class="btn-row">
          <button type="submit" class="btn-small" style="padding:10px 18px;">Submit</button>
          <button type="button" class="btn-secondary" id="cancel-modal">Cancel</button>
        </div>
      </form>
    `);
    const typeSelect = $('#request-type-select');
    const amountWrap = $('#amount-field-wrap');
    const toggleAmount = () => { amountWrap.style.display = typeSelect.value === 'reimbursement' ? 'block' : 'none'; };
    typeSelect.addEventListener('change', toggleAmount);
    toggleAmount();
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

// ---------- Recruitment (admin/hr only) ----------
async function renderRecruitment() {
  const [jobs, candidates] = await Promise.all([api('/recruitment/jobs'), api('/recruitment/candidates')]);
  const candidatesByJob = {};
  candidates.forEach(c => { (candidatesByJob[c.job_id] = candidatesByJob[c.job_id] || []).push(c); });

  $('#content').innerHTML = `
    <h2>Recruitment</h2>
    <p class="section-sub">Job openings and candidate pipeline.</p>
    <button class="btn-add" id="add-job-btn">+ New job opening</button>
    ${jobs.map(job => `
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div>
            <h3 style="margin:0 0 4px;">${job.title}</h3>
            <p style="margin:0; color:var(--muted); font-size:13px;">${job.department || 'No department set'}</p>
          </div>
          <div style="display:flex; gap:8px; align-items:center;">
            ${statusTag(job.status)}
            <button class="btn-small edit-job" data-id="${job.id}">Edit</button>
          </div>
        </div>
        <div style="margin-top:14px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <strong style="font-size:13px;">Candidates (${(candidatesByJob[job.id] || []).length})</strong>
            <button class="btn-small add-candidate" data-job-id="${job.id}">+ Add candidate</button>
          </div>
          <table>
            <thead><tr><th>Name</th><th>Contact</th><th>Stage</th><th></th></tr></thead>
            <tbody>
              ${(candidatesByJob[job.id] || []).map(c => `
                <tr>
                  <td>${c.full_name}</td>
                  <td>${c.email || c.phone || '—'}</td>
                  <td>${statusTag(c.stage)}</td>
                  <td><button class="btn-small edit-candidate" data-id="${c.id}">Update</button></td>
                </tr>`).join('') || `<tr><td colspan="4" class="empty-state">No candidates yet for this role.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `).join('') || `<div class="empty-state">No job openings yet.</div>`}
  `;

  $('#add-job-btn').addEventListener('click', () => openJobForm());
  $$('.edit-job').forEach(b => b.addEventListener('click', () => {
    openJobForm(jobs.find(j => j.id === Number(b.dataset.id)));
  }));
  $$('.add-candidate').forEach(b => b.addEventListener('click', () => openCandidateForm(Number(b.dataset.jobId))));
  $$('.edit-candidate').forEach(b => b.addEventListener('click', () => {
    openCandidateForm(null, candidates.find(c => c.id === Number(b.dataset.id)));
  }));
}

function openJobForm(job) {
  const isEdit = !!job;
  openModal(`
    <h3>${isEdit ? 'Edit job opening' : 'New job opening'}</h3>
    <form id="job-form">
      <label>Title</label><input name="title" value="${job?.title || ''}" required>
      <label>Department</label><input name="department" value="${job?.department || ''}">
      <label>Description</label><input name="description" value="${job?.description || ''}">
      <label>Status</label>
      <select name="status" style="width:100%; padding:11px 12px; border:1px solid var(--line); border-radius:3px; margin-bottom:18px;">
        <option value="open" ${job?.status === 'open' ? 'selected' : ''}>Open</option>
        <option value="on_hold" ${job?.status === 'on_hold' ? 'selected' : ''}>On hold</option>
        <option value="closed" ${job?.status === 'closed' ? 'selected' : ''}>Closed</option>
      </select>
      <div class="btn-row">
        <button type="submit" class="btn-small" style="padding:10px 18px;">Save</button>
        <button type="button" class="btn-secondary" id="cancel-modal">Cancel</button>
      </div>
    </form>
  `);
  $('#cancel-modal').addEventListener('click', closeModal);
  $('#job-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    try {
      if (isEdit) await api(`/recruitment/jobs/${job.id}`, { method: 'PUT', body: fd });
      else await api('/recruitment/jobs', { method: 'POST', body: fd });
      closeModal();
      toast('Saved');
      navigate('recruitment');
    } catch (err) { toast(err.message); }
  });
}

function openCandidateForm(jobId, candidate) {
  const isEdit = !!candidate;
  openModal(`
    <h3>${isEdit ? 'Update candidate' : 'Add candidate'}</h3>
    <form id="candidate-form">
      ${!isEdit ? `
        <label>Full name</label><input name="full_name" required>
        <label>Email</label><input name="email" type="email">
        <label>Phone</label><input name="phone">
      ` : `<p style="font-size:14px;">${candidate.full_name}</p>`}
      <label>Stage</label>
      <select name="stage" style="width:100%; padding:11px 12px; border:1px solid var(--line); border-radius:3px; margin-bottom:18px;">
        <option value="applied" ${candidate?.stage === 'applied' ? 'selected' : ''}>Applied</option>
        <option value="interview" ${candidate?.stage === 'interview' ? 'selected' : ''}>Interview</option>
        <option value="offer" ${candidate?.stage === 'offer' ? 'selected' : ''}>Offer</option>
        <option value="hired" ${candidate?.stage === 'hired' ? 'selected' : ''}>Hired</option>
        <option value="rejected" ${candidate?.stage === 'rejected' ? 'selected' : ''}>Rejected</option>
      </select>
      <label>Notes</label><input name="notes" value="${candidate?.notes || ''}">
      <div class="btn-row">
        <button type="submit" class="btn-small" style="padding:10px 18px;">Save</button>
        <button type="button" class="btn-secondary" id="cancel-modal">Cancel</button>
      </div>
    </form>
  `);
  $('#cancel-modal').addEventListener('click', closeModal);
  $('#candidate-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    try {
      if (isEdit) {
        await api(`/recruitment/candidates/${candidate.id}`, { method: 'PUT', body: { stage: fd.stage, notes: fd.notes } });
      } else {
        await api('/recruitment/candidates', { method: 'POST', body: { ...fd, job_id: jobId } });
      }
      closeModal();
      toast('Saved');
      navigate('recruitment');
    } catch (err) { toast(err.message); }
  });
}

// ---------- Employee exits (admin/hr) ----------
async function renderExitsAdmin() {
  const rows = await api('/exit');
  $('#content').innerHTML = `
    <h2>Employee exits</h2>
    <p class="section-sub">Track resignations through notice period, clearance, and completion.</p>
    <div class="card" style="padding:0;">
      <table>
        <thead><tr><th>Employee</th><th>Resignation date</th><th>Requested last day</th><th>Confirmed last day</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${rows.map(x => `
            <tr>
              <td>${x.full_name} <span class="mono" style="color:var(--muted); font-size:12px;">(${x.employee_code})</span></td>
              <td class="mono">${x.resignation_date}</td>
              <td class="mono">${x.requested_last_day}</td>
              <td class="mono">${x.confirmed_last_day || '—'}</td>
              <td>${statusTag(x.status)}</td>
              <td><button class="btn-small manage-exit" data-id="${x.id}">Manage</button></td>
            </tr>`).join('') || `<tr><td colspan="6" class="empty-state">No exits in progress.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
  $$('.manage-exit').forEach(b => b.addEventListener('click', () => {
    const x = rows.find(r => r.id === Number(b.dataset.id));
    openModal(`
      <h3>Exit — ${x.full_name}</h3>
      <p style="color:var(--muted); font-size:13px; margin-top:-10px;">Reason: ${x.reason || 'Not specified'}</p>
      <form id="exit-form">
        <label>Status</label>
        <select name="status" style="width:100%; padding:11px 12px; border:1px solid var(--line); border-radius:3px; margin-bottom:18px;">
          <option value="notice_period" ${x.status === 'notice_period' ? 'selected' : ''}>Notice period</option>
          <option value="clearance" ${x.status === 'clearance' ? 'selected' : ''}>Clearance</option>
          <option value="completed" ${x.status === 'completed' ? 'selected' : ''}>Completed</option>
          <option value="withdrawn" ${x.status === 'withdrawn' ? 'selected' : ''}>Withdrawn</option>
        </select>
        <label>Confirmed last working day</label><input name="confirmed_last_day" type="date" value="${x.confirmed_last_day || ''}">
        <label>Clearance notes</label><input name="clearance_notes" value="${x.clearance_notes || ''}">
        <p style="font-size:12px; color:var(--muted); margin-top:-10px;">Setting status to "Completed" will deactivate this employee's account.</p>
        <div id="gratuity-result" style="font-size:13px; margin-bottom:14px;"></div>
        <div class="btn-row">
          <button type="button" class="btn-secondary" id="view-gratuity-btn">View gratuity estimate</button>
        </div>
        <div class="btn-row" style="margin-top:10px;">
          <button type="submit" class="btn-small" style="padding:10px 18px;">Save</button>
          <button type="button" class="btn-secondary" id="cancel-modal">Cancel</button>
        </div>
      </form>
    `);
    $('#view-gratuity-btn').addEventListener('click', async () => {
      const resultEl = $('#gratuity-result');
      resultEl.textContent = 'Calculating...';
      try {
        const g = await api(`/exit/${x.id}/gratuity`);
        resultEl.innerHTML = `<strong>Estimated gratuity: ${money(g.estimated_gratuity)}</strong> (${g.years_of_service} years of service, based on basic salary of ${money(g.basic_salary_used)}). <span style="color:var(--muted);">${g.note}</span>`;
      } catch (err) {
        resultEl.textContent = err.message;
      }
    });
    $('#cancel-modal').addEventListener('click', closeModal);
    $('#exit-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      try {
        await api(`/exit/${x.id}`, { method: 'PUT', body: fd });
        closeModal();
        toast('Updated');
        navigate('exits');
      } catch (err) { toast(err.message); }
    });
  }));
}

// ---------- Loans & advances (admin/hr) ----------
async function renderLoansAdmin() {
  const rows = await api('/loans');
  $('#content').innerHTML = `
    <h2>Loans & advances</h2>
    <p class="section-sub">Employee-submitted requests for salary advances or loans.</p>
    <div class="card" style="padding:0;">
      <table>
        <thead><tr><th>Employee</th><th>Amount</th><th>Reason</th><th>Repayment (months)</th><th>Repaid</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${rows.map(l => `
            <tr>
              <td>${l.full_name}</td>
              <td>${money(l.amount)}</td>
              <td>${l.reason || '—'}</td>
              <td>${l.repayment_months}</td>
              <td>${money(l.amount_repaid)}</td>
              <td>${statusTag(l.status)}</td>
              <td>${l.status === 'pending' ? `
                <button class="btn-small approve-loan" data-id="${l.id}">Approve</button>
                <button class="btn-small reject reject-loan" data-id="${l.id}">Reject</button>
              ` : l.status === 'approved' ? `<button class="btn-small mark-repaid" data-id="${l.id}">Mark repaid</button>` : ''}</td>
            </tr>`).join('') || `<tr><td colspan="7" class="empty-state">No loan requests yet.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
  $$('.approve-loan').forEach(b => b.addEventListener('click', () => updateLoan(b.dataset.id, { status: 'approved' })));
  $$('.reject-loan').forEach(b => b.addEventListener('click', () => updateLoan(b.dataset.id, { status: 'rejected' })));
  $$('.mark-repaid').forEach(b => b.addEventListener('click', () => {
    const loan = rows.find(l => l.id === Number(b.dataset.id));
    updateLoan(b.dataset.id, { status: 'repaid', amount_repaid: loan.amount });
  }));
}
async function updateLoan(id, body) {
  try {
    await api(`/loans/${id}`, { method: 'PUT', body });
    toast('Updated');
    navigate('loans');
  } catch (err) { toast(err.message); }
}

async function renderMyLoans() {
  const rows = await api('/loans');
  $('#content').innerHTML = `
    <h2>Loans & advances</h2>
    <p class="section-sub">Request a salary advance or loan.</p>
    <button class="btn-add" id="add-loan-btn">+ Request advance</button>
    <div class="card" style="padding:0;">
      <table>
        <thead><tr><th>Amount</th><th>Reason</th><th>Repayment (months)</th><th>Status</th></tr></thead>
        <tbody>
          ${rows.map(l => `
            <tr><td>${money(l.amount)}</td><td>${l.reason || '—'}</td><td>${l.repayment_months}</td><td>${statusTag(l.status)}</td></tr>
          `).join('') || `<tr><td colspan="4" class="empty-state">No requests yet.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
  $('#add-loan-btn').addEventListener('click', () => {
    openModal(`
      <h3>Request advance</h3>
      <form id="loan-form">
        <label>Amount</label><input name="amount" type="number" step="0.01" required>
        <label>Reason</label><input name="reason">
        <label>Repayment period (months)</label><input name="repayment_months" type="number" value="1" min="1">
        <div class="btn-row">
          <button type="submit" class="btn-small" style="padding:10px 18px;">Submit</button>
          <button type="button" class="btn-secondary" id="cancel-modal">Cancel</button>
        </div>
      </form>
    `);
    $('#cancel-modal').addEventListener('click', closeModal);
    $('#loan-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      try {
        await api('/loans', { method: 'POST', body: fd });
        closeModal();
        toast('Request submitted');
        navigate('my-loans');
      } catch (err) { toast(err.message); }
    });
  });
}

// ---------- Documents (admin/hr) ----------
const DOC_LABELS = { passport: 'Passport', visa: 'Visa', work_permit: 'Work permit', driving_license: 'Driving license', emirates_id: 'Emirates ID', other: 'Other' };

async function renderDocumentsAdmin() {
  const [docs, expiring, employees] = await Promise.all([api('/documents'), api('/documents/expiring?days=60'), api('/employees')]);
  $('#content').innerHTML = `
    <h2>Documents</h2>
    <p class="section-sub">Passports, visas, work permits, and expiry tracking.</p>
    ${expiring.length ? `
      <div class="card" style="border-left:3px solid var(--rust);">
        <h3 style="margin-top:0;">⚠ Expiring within 60 days</h3>
        <table>
          <thead><tr><th>Employee</th><th>Document</th><th>Expiry date</th></tr></thead>
          <tbody>
            ${expiring.map(d => `<tr><td>${d.full_name}</td><td>${DOC_LABELS[d.doc_type]}</td><td class="mono">${d.is_expired ? '<strong style="color:var(--rust);">Expired</strong> — ' : ''}${d.expiry_date}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    ` : ''}
    <button class="btn-add" id="add-doc-btn">+ Add document</button>
    <div class="card" style="padding:0;">
      <table>
        <thead><tr><th>Employee</th><th>Type</th><th>Number</th><th>Expiry</th></tr></thead>
        <tbody>
          ${docs.map(d => `<tr><td>${d.full_name}</td><td>${DOC_LABELS[d.doc_type]}</td><td class="mono">${d.doc_number || '—'}</td><td class="mono">${d.expiry_date || '—'}</td></tr>`).join('') || `<tr><td colspan="4" class="empty-state">No documents on file.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
  $('#add-doc-btn').addEventListener('click', () => {
    openModal(`
      <h3>Add document</h3>
      <form id="doc-form">
        <label>Employee</label>
        <select name="employee_id" required style="width:100%; padding:11px 12px; border:1px solid var(--line); border-radius:3px; margin-bottom:18px;">
          ${employees.map(e => `<option value="${e.id}">${e.full_name} (${e.employee_code})</option>`).join('')}
        </select>
        <label>Document type</label>
        <select name="doc_type" style="width:100%; padding:11px 12px; border:1px solid var(--line); border-radius:3px; margin-bottom:18px;">
          ${Object.entries(DOC_LABELS).map(([val, label]) => `<option value="${val}">${label}</option>`).join('')}
        </select>
        <label>Document number</label><input name="doc_number">
        <label>Expiry date</label><input name="expiry_date" type="date">
        <div class="btn-row">
          <button type="submit" class="btn-small" style="padding:10px 18px;">Save</button>
          <button type="button" class="btn-secondary" id="cancel-modal">Cancel</button>
        </div>
      </form>
    `);
    $('#cancel-modal').addEventListener('click', closeModal);
    $('#doc-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      try {
        await api('/documents', { method: 'POST', body: fd });
        closeModal();
        toast('Saved');
        navigate('documents');
      } catch (err) { toast(err.message); }
    });
  });
}

// ---------- Assets (admin/hr) ----------
async function renderAssetsAdmin() {
  const [assets, employees] = await Promise.all([api('/assets'), api('/employees')]);
  $('#content').innerHTML = `
    <h2>Assets</h2>
    <p class="section-sub">Company equipment allocated to employees.</p>
    <button class="btn-add" id="add-asset-btn">+ Allocate asset</button>
    <div class="card" style="padding:0;">
      <table>
        <thead><tr><th>Employee</th><th>Asset</th><th>Tag</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${assets.map(a => `
            <tr>
              <td>${a.full_name}</td><td>${a.asset_name}</td><td class="mono">${a.asset_tag || '—'}</td><td>${statusTag(a.status)}</td>
              <td>${a.status === 'allocated' ? `<button class="btn-small return-asset" data-id="${a.id}">Mark returned</button>` : ''}</td>
            </tr>`).join('') || `<tr><td colspan="5" class="empty-state">No assets allocated yet.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
  $('#add-asset-btn').addEventListener('click', () => {
    openModal(`
      <h3>Allocate asset</h3>
      <form id="asset-form">
        <label>Employee</label>
        <select name="employee_id" required style="width:100%; padding:11px 12px; border:1px solid var(--line); border-radius:3px; margin-bottom:18px;">
          ${employees.map(e => `<option value="${e.id}">${e.full_name} (${e.employee_code})</option>`).join('')}
        </select>
        <label>Asset name</label><input name="asset_name" required placeholder="e.g. MacBook Pro 14&quot;">
        <label>Asset tag / serial (optional)</label><input name="asset_tag">
        <label>Notes</label><input name="notes">
        <div class="btn-row">
          <button type="submit" class="btn-small" style="padding:10px 18px;">Save</button>
          <button type="button" class="btn-secondary" id="cancel-modal">Cancel</button>
        </div>
      </form>
    `);
    $('#cancel-modal').addEventListener('click', closeModal);
    $('#asset-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      try {
        await api('/assets', { method: 'POST', body: fd });
        closeModal();
        toast('Saved');
        navigate('assets');
      } catch (err) { toast(err.message); }
    });
  });
  $$('.return-asset').forEach(b => b.addEventListener('click', async () => {
    try {
      await api(`/assets/${b.dataset.id}/return`, { method: 'PUT' });
      toast('Marked returned');
      navigate('assets');
    } catch (err) { toast(err.message); }
  }));
}

// ---------- Grades (admin/hr) ----------
async function renderGradesAdmin() {
  const grades = await api('/grades');
  $('#content').innerHTML = `
    <h2>Grades</h2>
    <p class="section-sub">Job grades and the benefits tied to each — set an employee's grade from their profile in Employees.</p>
    <button class="btn-add" id="add-grade-btn">+ Add grade</button>
    <div class="card" style="padding:0;">
      <table>
        <thead><tr><th>Grade</th><th>Benefits</th></tr></thead>
        <tbody>
          ${grades.map(g => `<tr><td>${g.name}</td><td>${g.benefits || '—'}</td></tr>`).join('') || `<tr><td colspan="2" class="empty-state">No grades defined yet.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
  $('#add-grade-btn').addEventListener('click', () => {
    openModal(`
      <h3>Add grade</h3>
      <form id="grade-form">
        <label>Grade name</label><input name="name" required placeholder="e.g. Senior, Manager, L3">
        <label>Benefits</label><input name="benefits" placeholder="e.g. Extra 5 leave days, health cover upgrade">
        <div class="btn-row">
          <button type="submit" class="btn-small" style="padding:10px 18px;">Save</button>
          <button type="button" class="btn-secondary" id="cancel-modal">Cancel</button>
        </div>
      </form>
    `);
    $('#cancel-modal').addEventListener('click', closeModal);
    $('#grade-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      try {
        await api('/grades', { method: 'POST', body: fd });
        closeModal();
        toast('Saved');
        navigate('grades');
      } catch (err) { toast(err.message); }
    });
  });
}

// ---------- Employee: My profile ----------
async function renderMyProfile() {
  const [me, dependents, skills] = await Promise.all([
    api(`/employees/${state.user.id}`),
    api('/records/dependents'),
    api('/records/skills')
  ]);
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
        <div><label>Grade</label><p>${me.grade || '—'}</p></div>
      </div>
      <form id="phone-form">
        <label>Phone</label><input name="phone" value="${me.phone || ''}">
        <button type="submit" class="btn-small" style="padding:9px 16px;">Update phone</button>
      </form>
    </div>
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <h3 style="margin:0;">Dependents</h3>
        <button class="btn-small" id="add-dependent-btn">+ Add</button>
      </div>
      <table>
        <thead><tr><th>Name</th><th>Relationship</th><th>Date of birth</th></tr></thead>
        <tbody>
          ${dependents.map(d => `<tr><td>${d.full_name}</td><td>${d.relationship}</td><td class="mono">${d.date_of_birth || '—'}</td></tr>`).join('') || `<tr><td colspan="3" class="empty-state">None added yet.</td></tr>`}
        </tbody>
      </table>
    </div>
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <h3 style="margin:0;">Skills & education</h3>
        <button class="btn-small" id="add-skill-btn">+ Add</button>
      </div>
      <table>
        <thead><tr><th>Type</th><th>Label</th><th>Detail</th></tr></thead>
        <tbody>
          ${skills.map(s => `<tr><td>${s.type}</td><td>${s.label}</td><td>${s.detail || '—'}</td></tr>`).join('') || `<tr><td colspan="3" class="empty-state">None added yet.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
  $('#phone-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    await api(`/employees/${me.id}`, { method: 'PUT', body: fd });
    toast('Updated');
  });
  $('#add-dependent-btn').addEventListener('click', () => {
    openModal(`
      <h3>Add dependent</h3>
      <form id="dependent-form">
        <label>Full name</label><input name="full_name" required>
        <label>Relationship</label>
        <select name="relationship" style="width:100%; padding:11px 12px; border:1px solid var(--line); border-radius:3px; margin-bottom:18px;">
          <option value="spouse">Spouse</option>
          <option value="child">Child</option>
          <option value="parent">Parent</option>
          <option value="other">Other</option>
        </select>
        <label>Date of birth</label><input name="date_of_birth" type="date">
        <div class="btn-row">
          <button type="submit" class="btn-small" style="padding:10px 18px;">Save</button>
          <button type="button" class="btn-secondary" id="cancel-modal">Cancel</button>
        </div>
      </form>
    `);
    $('#cancel-modal').addEventListener('click', closeModal);
    $('#dependent-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      try {
        await api('/records/dependents', { method: 'POST', body: fd });
        closeModal();
        toast('Saved');
        navigate('my-profile');
      } catch (err) { toast(err.message); }
    });
  });
  $('#add-skill-btn').addEventListener('click', () => {
    openModal(`
      <h3>Add skill / education</h3>
      <form id="skill-form">
        <label>Type</label>
        <select name="type" style="width:100%; padding:11px 12px; border:1px solid var(--line); border-radius:3px; margin-bottom:18px;">
          <option value="skill">Skill</option>
          <option value="education">Education</option>
          <option value="certification">Certification</option>
        </select>
        <label>Label</label><input name="label" required placeholder="e.g. Excel, BBA, PMP">
        <label>Detail (optional)</label><input name="detail" placeholder="e.g. University name, issuing body, year">
        <div class="btn-row">
          <button type="submit" class="btn-small" style="padding:10px 18px;">Save</button>
          <button type="button" class="btn-secondary" id="cancel-modal">Cancel</button>
        </div>
      </form>
    `);
    $('#cancel-modal').addEventListener('click', closeModal);
    $('#skill-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      try {
        await api('/records/skills', { method: 'POST', body: fd });
        closeModal();
        toast('Saved');
        navigate('my-profile');
      } catch (err) { toast(err.message); }
    });
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

// ---------- Employee: My exit / resignation ----------
async function renderMyExit() {
  const rows = await api('/exit');
  const active = rows.find(x => x.status !== 'completed' && x.status !== 'withdrawn');

  $('#content').innerHTML = `
    <h2>Resignation</h2>
    <p class="section-sub">Submit a resignation request and track its progress.</p>
    ${active ? '' : '<button class="btn-add" id="submit-resignation-btn">+ Submit resignation</button>'}
    <div class="card" style="padding:0;">
      <table>
        <thead><tr><th>Resignation date</th><th>Requested last day</th><th>Confirmed last day</th><th>Status</th><th>Clearance notes</th></tr></thead>
        <tbody>
          ${rows.map(x => `
            <tr>
              <td class="mono">${x.resignation_date}</td>
              <td class="mono">${x.requested_last_day}</td>
              <td class="mono">${x.confirmed_last_day || '—'}</td>
              <td>${statusTag(x.status)}</td>
              <td>${x.clearance_notes || '—'}</td>
            </tr>`).join('') || `<tr><td colspan="5" class="empty-state">No resignation on file.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
  if (!active) {
    $('#submit-resignation-btn').addEventListener('click', () => {
      openModal(`
        <h3>Submit resignation</h3>
        <form id="resignation-form">
          <label>Requested last working day</label><input name="requested_last_day" type="date" required>
          <label>Reason (optional)</label><input name="reason">
          <div class="btn-row">
            <button type="submit" class="btn-small" style="padding:10px 18px;">Submit</button>
            <button type="button" class="btn-secondary" id="cancel-modal">Cancel</button>
          </div>
        </form>
      `);
      $('#cancel-modal').addEventListener('click', closeModal);
      $('#resignation-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = Object.fromEntries(new FormData(e.target));
        try {
          await api('/exit', { method: 'POST', body: fd });
          closeModal();
          toast('Resignation submitted');
          navigate('my-exit');
        } catch (err) { toast(err.message); }
      });
    });
  }
}

loadBrand();
tryAutoLogin();
