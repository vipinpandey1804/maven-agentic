const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const config = require('../config');
const { dobPassword, numberToWordsINR } = require('../utils/helpers');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const inr = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Generates a password-protected (AES-256) salary slip PDF.
 * Password = employee DOB as DDMMYYYY.
 * Returns the storage path.
 */
async function generateSlip({ employee, record, month, year, company, encrypted = true }) {
  const dir = path.join(config.storageDir, 'slips', `${year}-${String(month).padStart(2, '0')}`);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${employee.employee_id}${encrypted ? '' : '-preview'}.pdf`);

  const opts = { size: 'A4', margin: 50 };
  if (encrypted) {
    opts.userPassword = dobPassword(employee.dob);
    opts.ownerPassword = config.secretKey;
    opts.pdfVersion = '1.7ext3'; // AES-256
    opts.permissions = { printing: 'highResolution' };
  }
  const doc = new PDFDocument(opts);
  const stream = fs.createWriteStream(file);
  doc.pipe(stream);

  // Header
  doc.rect(0, 0, doc.page.width, 90).fill('#1e293b');
  doc.fill('#ffffff').fontSize(20).font('Helvetica-Bold').text(company?.name || 'Company', 50, 28);
  doc.fontSize(9).font('Helvetica').text(company?.address || '', 50, 54);
  doc.fontSize(12).font('Helvetica-Bold').text(`Salary Slip - ${MONTHS[month - 1]} ${year}`, 0, 36, { align: 'right', width: doc.page.width - 50 });

  // Employee details
  doc.fill('#0f172a').fontSize(10).font('Helvetica');
  const top = 115;
  const left = [
    ['Employee ID', employee.employee_id],
    ['Name', employee.full_name],
    ['Designation', employee.designation || '-'],
  ];
  const right = [
    ['Department', employee.department || '-'],
    ['Date of Joining', employee.date_of_joining || '-'],
    ['Email', employee.email],
  ];
  left.forEach(([k, v], i) => {
    doc.font('Helvetica-Bold').text(`${k}:`, 50, top + i * 18, { continued: true }).font('Helvetica').text(`  ${v}`);
  });
  right.forEach(([k, v], i) => {
    doc.font('Helvetica-Bold').text(`${k}:`, 320, top + i * 18, { continued: true }).font('Helvetica').text(`  ${v}`);
  });

  // Earnings / deductions table
  const tableTop = 195;
  const earnings = [
    ['Basic', record.basic], ['HRA', record.hra], ['Allowances', record.allowances],
  ];
  const deductions = [
    ['Deductions', record.deductions], ['LOP Days', record.lop_days, true],
  ];
  doc.rect(50, tableTop, 495, 24).fill('#e2e8f0');
  doc.fill('#0f172a').font('Helvetica-Bold').fontSize(10);
  doc.text('Earnings', 60, tableTop + 7).text('Amount (INR)', 200, tableTop + 7)
    .text('Deductions', 320, tableTop + 7).text('Amount (INR)', 450, tableTop + 7);

  doc.font('Helvetica').fontSize(10);
  const rows = Math.max(earnings.length, deductions.length);
  for (let i = 0; i < rows; i++) {
    const y = tableTop + 32 + i * 20;
    if (earnings[i]) { doc.text(earnings[i][0], 60, y).text(inr(earnings[i][1]), 200, y); }
    if (deductions[i]) {
      doc.text(deductions[i][0], 320, y).text(deductions[i][2] ? String(deductions[i][1] || 0) : inr(deductions[i][1]), 450, y);
    }
  }
  const grossEarn = Number(record.basic || 0) + Number(record.hra || 0) + Number(record.allowances || 0);
  const totY = tableTop + 32 + rows * 20 + 8;
  doc.moveTo(50, totY - 4).lineTo(545, totY - 4).strokeColor('#cbd5e1').stroke();
  doc.font('Helvetica-Bold')
    .text('Gross Earnings', 60, totY).text(inr(grossEarn), 200, totY)
    .text('Total Deductions', 320, totY).text(inr(record.deductions), 450, totY);

  // Net pay
  const netY = totY + 36;
  doc.rect(50, netY, 495, 44).fill('#1e293b');
  doc.fill('#ffffff').fontSize(13).text(`NET PAY:  INR ${inr(record.net_pay)}`, 60, netY + 8);
  doc.fontSize(9).font('Helvetica').text(`${numberToWordsINR(record.net_pay)} Rupees Only`, 60, netY + 27);

  doc.fill('#64748b').fontSize(8)
    .text('This is a system-generated salary slip and does not require a signature.', 50, netY + 70)
    .text(`Generated on ${new Date().toISOString().slice(0, 10)}. PDF password: your date of birth in DDMMYYYY format.`, 50, netY + 82);

  doc.end();
  await new Promise((resolve, reject) => { stream.on('finish', resolve); stream.on('error', reject); });
  return file;
}

module.exports = { generateSlip, MONTHS };
