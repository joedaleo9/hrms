# HRMS — Workforce Console

A standalone HR management system with individual employee logins. Built with Node.js/Express and a plain JSON-file database on the backend, and a lightweight HTML/JS frontend (no build step required). Deliberately avoids any dependency that needs compiling (like Python or Visual Studio Build Tools) — `npm install` just works.

## Modules included

- **Employees** — records, roles (Admin / HR / Employee), department, designation
- **Payroll** — monthly pay generation, viewable only by Admin/HR and the employee it belongs to
- **Attendance** — self check-in/check-out, admin correction
- **Leave** — request, approve, reject
- **Requests** — salary certificates, experience letters, ID reissue, reimbursements, and other ad-hoc HR requests

## Security model

- Passwords are hashed with bcrypt — never stored in plain text.
- Authentication uses JWTs (8-hour expiry).
- **Role-based access control**: Employees can only see their own payroll, attendance, and requests. Only Admin/HR can view all employee data, generate payroll, and approve leave/requests.
- An `audit_log` table records logins, employee edits, payroll generation, and request/leave reviews.
- Employee records are never hard-deleted — only deactivated — so historical payroll/attendance data stays intact.

## Local setup

1. **Install dependencies**
   ```
   cd backend
   npm install
   ```

2. **Configure environment**
   ```
   cp .env.example .env
   ```
   Then edit `.env` and set a real `JWT_SECRET`. Generate one with:
   ```
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

3. **Create the first admin account and name this system**
   ```
   npm run seed
   ```
   This will ask you interactively for:
   - Brand/company name (shown on the login screen and topbar — e.g. "Dusoul HRMS")
   - Admin full name, email, and password

   Useful when running separate independent installs per brand (e.g. one for Dusoul, one for D1969) — each shows its own name so it's clear which system you're logged into.

4. **Start the server**
   ```
   npm start
   ```
   The app (frontend + API) will be available at `http://localhost:4000`.

5. **Log in** with the admin email/password you set, then immediately use "Change password" (or add it to your workflow) and start adding real employees — each gets their own login.

## Adding employees

Once logged in as Admin or HR:
- Go to **Employees → + Add employee**
- Set their employee code, email, and a temporary password
- Share those credentials with the employee directly (not over an insecure channel) — they can't self-register, which is intentional for data security

## Deploying for real use (50–200 employees)

This app is a single Node.js process + a SQLite file, which keeps hosting simple. Recommended options:

- **Railway** or **Render** — connect your Git repo, set the environment variables from `.env.example` in their dashboard, deploy. Both handle HTTPS automatically.
- **DigitalOcean App Platform** — similar simplicity, slightly more manual configuration.

Before going live:
- [ ] Set a strong, unique `JWT_SECRET` per installation (never reuse between separate systems, e.g. Dusoul vs D1969)
- [ ] Set `CORS_ORIGIN` to your actual domain instead of `*`
- [ ] Put the app behind HTTPS (all three platforms above do this automatically)
- [ ] Back up `backend/db/hrms-data.json` on a schedule — it's the entire database
- [ ] Change the admin password immediately after first login if it was shared with anyone during setup
- [ ] If you outgrow this scale significantly (many hundreds of employees, heavy concurrent writes), consider migrating to a real database like PostgreSQL

## Running separate independent systems (e.g. two brands, two HRs)

Each copy of this project is fully self-contained — its own SQLite database, its own login tokens. To run two independent systems:
1. Copy the whole `hrms` folder to each machine (or deploy as two separate services)
2. Run `npm install`, create `.env` with its **own unique** `JWT_SECRET`, then `npm run seed` on each — entering that system's own brand name and admin details
3. Neither system will share employees, payroll, or logins with the other

## Recommended next additions

- **Document storage** for contracts, offer letters, ID proofs (needs file upload handling + secure storage, e.g. S3)
- **Performance reviews** — periodic appraisals and goal tracking
- **Holiday calendar** — so leave/attendance correctly account for company holidays
- **Email notifications** — leave approvals, payslip generation, request updates
- **Password reset flow** — currently admin/HR must reset a forgotten password manually by editing the record

## Project structure

```
hrms/
  backend/
    server.js          # Express app entry point
    db/index.js          # JSON-file database (load/save helpers)
    db/seed.js            # Interactive first-time setup - brand name + admin account
    db/hrms-data.json     # Created automatically on first run - your actual data
    middleware/auth.js  # JWT auth + role checks
    routes/              # auth, employees, payroll, attendance, leave, requests
    .env.example
  frontend/
    index.html
    app.js
```
