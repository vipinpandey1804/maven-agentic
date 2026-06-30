// For users who have NOT changed their temp password yet (must_change_password = 1),
// reset the password to equal their CURRENT email. Fixes cases where the email was
// changed (e.g. domain rewrite) but the temp password still matched the old email.
// Run: npm run users:resync-temp
const bcrypt = require('bcryptjs');
const { init } = require('../src/db');

(async () => {
  try {
    const db = await init();
    const users = await db.all("SELECT id, email FROM users WHERE must_change_password = 1");
    let n = 0;
    for (const u of users) {
      await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [bcrypt.hashSync(u.email, 10), u.id]);
      n++;
    }
    console.log(`Resynced ${n} temporary password(s) to match the current email.`);
    console.log('These users can now log in with: email = password (then change it on first login).');
    process.exit(0);
  } catch (e) { console.error('Resync failed:', e.message); process.exit(1); }
})();
