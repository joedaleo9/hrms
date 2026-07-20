const fs = require('fs');
const bcrypt = require('bcryptjs');
const { load, save, nextId } = require('./index');

// Synchronous stdin prompt - reliable across terminals/shells.
function prompt(question) {
  process.stdout.write(question);
  const buf = Buffer.alloc(1);
  let line = '';
  while (true) {
    let bytesRead;
    try {
      bytesRead = fs.readSync(0, buf, 0, 1, null);
    } catch (err) {
      if (err.code === 'EAGAIN') continue;
      throw err;
    }
    if (bytesRead === 0) break;
    const char = buf.toString('utf8');
    if (char === '\n') break;
    if (char !== '\r') line += char;
  }
  return line.trim();
}

function main() {
  const data = load();
  const existingAdmin = data.employees.find(e => e.role === 'admin');

  if (data.settings.brand_name && existingAdmin) {
    console.log(`This system is already set up for "${data.settings.brand_name}" with an admin account.`);
    console.log('Delete backend/db/hrms-data.json if you want to start over.');
    return;
  }

  console.log('--- HRMS first-time setup ---\n');

  const brandName = prompt('Brand / company name shown on this system (e.g. "Dusoul HRMS"): ') || 'HRMS';
  const adminName = prompt('Admin full name: ') || 'System Admin';
  const adminEmail = prompt('Admin email (used to log in): ');
  const adminPassword = prompt('Admin password (min 8 characters): ');

  if (!adminEmail || !adminPassword || adminPassword.length < 8) {
    console.log('\nEmail is required and password must be at least 8 characters. Run `npm run seed` again.');
    return;
  }

  data.settings.brand_name = brandName;

  const existing = data.employees.find(e => e.email === adminEmail);
  if (existing) {
    save(data);
    console.log(`\nAn account with ${adminEmail} already exists. Brand name updated to "${brandName}".`);
  } else {
    const hash = bcrypt.hashSync(adminPassword, 10);
    data.employees.push({
      id: nextId(data, 'employees'),
      employee_code: 'EMP0001',
      full_name: adminName,
      email: adminEmail,
      password_hash: hash,
      role: 'admin',
      department: brandName,
      designation: 'System Admin',
      date_of_joining: new Date().toISOString().slice(0, 10),
      phone: null,
      status: 'active',
      created_at: new Date().toISOString()
    });
    save(data);

    console.log(`\nSetup complete for "${brandName}".`);
    console.log('  Admin email:', adminEmail);
    console.log('  Log in and add your real employees from the Employees tab.');
  }
}

main();
