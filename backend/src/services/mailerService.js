const nodemailer = require('nodemailer');
const settings = require('./settingsService');

async function getTransporter() {
  const smtp = await settings.get('smtp');
  if (smtp.transport === 'json' || !smtp.user) {
    // Dev mode: emails are serialized, not sent. Swap to real SMTP in admin settings.
    return { transporter: nodemailer.createTransport({ jsonTransport: true }), smtp, dev: true };
  }
  return {
    transporter: nodemailer.createTransport({
      host: smtp.host, port: Number(smtp.port) || 465, secure: smtp.secure !== false,
      auth: { user: smtp.user, pass: smtp.pass },
    }),
    smtp, dev: false,
  };
}

function renderTemplate(str, vars) {
  return String(str).replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{${k}}`));
}

async function send({ to, subject, html, attachments }) {
  const { transporter, smtp, dev } = await getTransporter();
  const info = await transporter.sendMail({
    from: `"${smtp.fromName || 'HR'}" <${smtp.fromEmail || smtp.user || 'hr@localhost'}>`,
    to, subject, html, attachments,
  });
  return { messageId: info.messageId, dev };
}

async function verify() {
  const { transporter, dev } = await getTransporter();
  if (dev) return { ok: true, dev: true, note: 'jsonTransport (dev mode) - configure SMTP user/pass to send real email' };
  await transporter.verify();
  return { ok: true, dev: false };
}

module.exports = { send, verify, renderTemplate };
