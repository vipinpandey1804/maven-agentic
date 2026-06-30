// Replace @example.com emails with @mailinator.com in employees + users (except admin).
// Run: npm run emails:mailinator
const bcrypt = require('bcryptjs');
const { init } = require('../src/db');

const FROM = '@example.com';
const TO = '@mailinator.com';

(async () => {
  try {
    const db = await init();
    let total = 0;
    for (const table of ['employees', 'users']) {
      const before = await db.all(`SELECT id, email FROM ${table} WHERE email LIKE ?`, [`%${FROM}`]);
      for (const row of before) {
        if (row.email === 'admin@company.com') continue;
        const next = row.email.replace(FROM, TO);
        await db.run(`UPDATE ${table} SET email = ? WHERE id = ?`, [next, row.id]);
        // if this is a user who still has the temp password, keep temp password = new email
        if (table === 'users') {
          const u = await db.get('SELECT must_change_password FROM users WHERE id = ?', [row.id]);
          if (u && u.must_change_password) await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [bcrypt.hashSync(next, 10), row.id]);
        }
        total++;
      }
      console.log(`${table}: updated ${before.filter(r => r.email !== 'admin@company.com').length}`);
    }
    console.log(`Done. ${total} email(s) moved to ${TO} (admin left untouched).`);
    console.log('Note: login passwords are unchanged. Restart the backend if it was running.');
    process.exit(0);
  } catch (e) {
    console.error('Rewrite failed:', e.message);
    process.exit(1);
  }
})();
