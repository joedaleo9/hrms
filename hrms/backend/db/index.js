// Simple JSON-file database. No native compilation required (no Python,
// no Visual Studio build tools) - just plain Node.js and the filesystem.
// Fine for the scale this app targets (tens to a couple hundred employees).

const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'hrms-data.json');

const EMPTY_DB = {
  employees: [],
  payroll: [],
  attendance: [],
  leave_requests: [],
  requests: [],
  job_openings: [],
  candidates: [],
  exits: [],
  documents: [],
  loans: [],
  assets: [],
  dependents: [],
  skills: [],
  grades: [],
  audit_log: [],
  settings: {},
  _next_id: {
    employees: 1, payroll: 1, attendance: 1, leave_requests: 1, requests: 1,
    job_openings: 1, candidates: 1, exits: 1, documents: 1, loans: 1, assets: 1,
    dependents: 1, skills: 1, grades: 1, audit_log: 1
  }
};

function load() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(EMPTY_DB, null, 2));
    return structuredClone(EMPTY_DB);
  }
  const raw = fs.readFileSync(DB_FILE, 'utf8');
  const data = JSON.parse(raw);
  // Fill in any tables/fields added after this file was first created
  for (const key of Object.keys(EMPTY_DB)) {
    if (!(key in data)) data[key] = structuredClone(EMPTY_DB[key]);
  }
  return data;
}

function save(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function nextId(data, table) {
  const id = data._next_id[table] || 1;
  data._next_id[table] = id + 1;
  return id;
}

module.exports = { load, save, nextId, DB_FILE };
