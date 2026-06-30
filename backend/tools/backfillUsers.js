// One-time: create logins for all already-imported employees that don't have one.
// Run: npm run users:backfill
const { backfillEmployeeAccounts } = require('../src/services/userService');

(async () => {
  try {
    const r = await backfillEmployeeAccounts(null);
    console.log(`Done. Created ${r.created} employee login(s), skipped ${r.skipped} (already had one or no email).`);
    console.log('Each new account uses the employee email as the password and must be changed on first login.');
    process.exit(0);
  } catch (e) {
    console.error('Backfill failed:', e.message);
    process.exit(1);
  }
})();
