// Salary-slip agent. On its schedule (default 1st of month, 09:00 IST) it sends
// the most recent APPROVED-but-not-yet-sent batch to all employees.
//
// Safety rules:
//  - Only APPROVED batches are ever sent. A batch that HR hasn't verified
//    (PENDING_APPROVAL) is NEVER auto-sent — instead HR/Admin get a reminder.
//  - Sending is idempotent: an employee already marked SENT is never re-sent,
//    and a fully-sent batch flips to status SENT so it won't go out again.
const config = require('../config');
const notify = require('../services/notificationService');

module.exports = {
  name: 'salary-slip-agent',
  defaultCron: '0 9 1 * *',
  defaultConfig: {},

  async run(ctx) {
    // 1) the newest APPROVED batch that still needs sending
    const batch = await ctx.db.get(
      "SELECT * FROM salary_batches WHERE status = 'APPROVED' ORDER BY year DESC, month DESC LIMIT 1"
    );

    if (!batch) {
      // 2) nothing approved — is something waiting on HR? give a useful reminder
      const pending = await ctx.db.get(
        "SELECT * FROM salary_batches WHERE status = 'PENDING_APPROVAL' ORDER BY year DESC, month DESC LIMIT 1"
      );
      const reason = pending
        ? `batch for ${pending.month}/${pending.year} is still awaiting HR approval`
        : 'no approved salary batch found';
      ctx.log(`salary-slip-agent: not sending - ${reason}`);

      notify.bgRoles(['hr', 'admin'], {
        type: 'salary',
        title: 'Salary slips were NOT sent',
        body: pending
          ? `Today's run skipped: the ${pending.month}/${pending.year} batch is still pending approval. Approve it, then use "Run now" to dispatch.`
          : 'Today\'s run found no approved batch to send. Please upload and approve one.',
        link: pending ? '/batches/' + pending.id : '/batches',
        email: { subject: '[Action needed] Salary slips not sent' },
      });
      // also email the configured admin directly
      try {
        await ctx.mailer.send({
          to: config.adminEmail,
          subject: `[Action needed] Salary slips not sent`,
          html: `<p>The salary-slip agent ran but did not send anything: <b>${reason}</b>.</p>
                 <p>Once HR approves the batch, open Salary Batches and click <b>Send</b> (or use Run now on the Agents page).</p>`,
        });
      } catch (e) { ctx.log('admin reminder failed:', e.message); }
      return { dispatched: false, reason };
    }

    // 3) approved batch found -> dispatch (idempotent inside sendBatch)
    ctx.log(`salary-slip-agent: dispatching approved batch ${batch.month}/${batch.year}`);
    const result = await ctx.salary.sendBatch(batch.id, null, { trigger: 'cron' });
    return { dispatched: true, month: batch.month, year: batch.year, ...result };
  },
};
