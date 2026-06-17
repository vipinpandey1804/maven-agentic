const bcrypt = require('bcryptjs');
const config = require('../config');
const { init } = require('./index');
const { migrate } = require('./migrate');
const { uuid, now } = require('../utils/helpers');

const wrap = (inner) => `<div style="font-family:Arial,sans-serif;max-width:560px">\n${inner}\n  <p style="color:#64748b;font-size:12px">This is an automated message from {company}.</p>\n</div>`;

const DEFAULT_TEMPLATES = [
  {
    name: 'salary-slip',
    description: 'Monthly salary slip (used by the salary-slip agent)',
    placeholders: ['name', 'month', 'year', 'company', 'net_pay'],
    subject: 'Salary Slip - {month} {year} | {company}',
    body_html: wrap(`  <h2 style="color:#1e293b">Salary Slip - {month} {year}</h2>
  <p>Dear {name},</p>
  <p>Please find attached your salary slip for <b>{month} {year}</b>.</p>
  <p>The PDF is password-protected. Your password is your <b>date of birth in DDMMYYYY format</b> (e.g. 18041996).</p>
  <p>If you have questions about your salary, reply to this email.</p>`),
  },
  {
    name: 'welcome',
    description: 'Welcome email for a new joinee',
    placeholders: ['name', 'designation', 'department', 'company', 'date_of_joining'],
    subject: 'Welcome to {company}, {name}!',
    body_html: wrap(`  <h2 style="color:#1e293b">Welcome aboard, {name}! 🎉</h2>
  <p>We're thrilled to have you join {company} as <b>{designation}</b> in the <b>{department}</b> team.</p>
  <p>Your journey with us begins on {date_of_joining}. We can't wait to see the great things we'll build together.</p>
  <p>If you need anything to get started, just reply to this email.</p>`),
  },
  {
    name: 'birthday',
    description: 'Birthday wishes',
    placeholders: ['name', 'company'],
    subject: 'Happy Birthday, {name}! 🎂',
    body_html: wrap(`  <h2 style="color:#1e293b">Happy Birthday, {name}! 🎂</h2>
  <p>Everyone at {company} wishes you a wonderful day filled with joy and celebration.</p>
  <p>Thank you for being a valued part of our team. Have an amazing year ahead!</p>`),
  },
  {
    name: 'work-anniversary',
    description: 'Work anniversary congratulations',
    placeholders: ['name', 'years', 'company', 'date_of_joining'],
    subject: 'Congratulations on {years} year(s) at {company}, {name}!',
    body_html: wrap(`  <h2 style="color:#1e293b">Happy Work Anniversary, {name}! 🎊</h2>
  <p>Today marks <b>{years} year(s)</b> since you joined {company} on {date_of_joining}.</p>
  <p>Thank you for your dedication and contributions. Here's to many more milestones together!</p>`),
  },
  {
    name: 'promotional',
    description: 'General announcement / promotional email',
    placeholders: ['name', 'company'],
    subject: 'An update from {company}',
    body_html: wrap(`  <h2 style="color:#1e293b">Hello {name},</h2>
  <p>{company} has an announcement to share with you.</p>
  <p>[ Write your announcement here. ]</p>`),
  },
];

async function seed({ quiet = false } = {}) {
  await migrate();
  const db = await init();
  const log = (...a) => !quiet && console.log(...a);

  const admin = await db.get('SELECT id FROM users WHERE email = ?', [config.adminEmail.toLowerCase()]);
  if (!admin) {
    await db.run('INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)',
      [uuid(), config.adminEmail.toLowerCase(), bcrypt.hashSync(config.adminPassword, 10), 'admin', now()]);
    log(`Admin user created: ${config.adminEmail}`);
  }

  for (const t of DEFAULT_TEMPLATES) {
    const existing = await db.get('SELECT id FROM email_templates WHERE name = ?', [t.name]);
    if (!existing) {
      await db.run('INSERT INTO email_templates (id, name, subject, body_html, placeholders_json, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [uuid(), t.name, t.subject, t.body_html, JSON.stringify({ description: t.description, placeholders: t.placeholders }), now()]);
      log(`Default template created: ${t.name}`);
    }
  }
  log('Seed complete.');
}

if (require.main === module) {
  seed().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { seed };
