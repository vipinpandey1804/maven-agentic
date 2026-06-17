// v1 agent: on the 1st of each month, dispatch the APPROVED batch for that month.
// If none is approved, notify the admin instead of sending anything.
const config = require('../config');

module.exports = {
  name: 'salary-slip-agent',
  defaultCron: '0 9 1 * *', // 09:00 on day 1 monthly
  defaultConfig: {},

  async run(ctx) {
    const nowDate = new Date();
    const month = nowDate.getMonth() + 1;
    const year = nowDate.getFullYear();

    const batch = await ctx.db.get('SELECT * FROM salary_batches WHERE month = ? AND year = ?', [month, year]);
    if (!batch || !['APPROVED', 'SENT'].includes(batch.status)) {
      const reason = !batch ? 'no batch uploaded' : `batch is ${batch.status}`;
      ctx.log(`salary-slip-agent: nothing to send for ${month}/${year} (${reason}) - notifying admin`);
      try {
        await ctx.mailer.send({
          to: config.adminEmail,
          subject: `[Action needed] Salary slips for ${month}/${year} not sent`,
          html: `<p>The salary slip agent ran but could not dispatch: <b>${reason}</b>.</p>
                 <p>Please upload and approve the batch in the admin panel.</p>`,
        });
      } catch (e) { ctx.log('admin reminder failed:', e.message); }
      return { dispatched: false, reason };
    }
    if (batch.status === 'SENT') return { dispatched: false, reason: 'already sent' };

    const result = await ctx.salary.sendBatch(batch.id, null, { trigger: 'cron' });
    return { dispatched: true, ...result };
  },
};
