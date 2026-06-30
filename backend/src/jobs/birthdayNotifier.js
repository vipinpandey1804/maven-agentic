const cron = require('node-cron');
const { init } = require('../db');
const notify = require('../services/notificationService');

// Notify employees (and HR/Admin) about birthdays each morning.
async function runOnce() {
  const db = await init();
  const today = new Date();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const emps = await db.all("SELECT id, full_name, dob FROM employees WHERE status = 'active'");
  const birthdays = emps.filter((e) => {
    if (!e.dob) return false;
    const d = new Date(e.dob);
    if (Number.isNaN(d.getTime())) return false;
    return String(d.getMonth() + 1).padStart(2, '0') === mm && String(d.getDate()).padStart(2, '0') === dd;
  });
  for (const e of birthdays) {
    notify.bgEmployee(e.id, { type: 'birthday', title: 'Happy Birthday! 🎂',
      body: `Wishing you a wonderful year ahead, ${e.full_name.split(' ')[0]}!`, link: '/me' });
  }
  if (birthdays.length) {
    notify.bgRoles(['hr', 'admin'], { type: 'birthday', title: 'Birthdays today 🎉',
      body: birthdays.map((e) => e.full_name).join(', ') + ` ${birthdays.length > 1 ? 'have' : 'has'} a birthday today.`, link: '/employees' });
  }
  return birthdays.length;
}

function start() {
  cron.schedule('0 8 * * *', () => { runOnce().catch((e) => console.error('[birthday]', e.message)); });
  console.log('[birthday] daily notifier scheduled @ 08:00');
}

module.exports = { start, runOnce };
