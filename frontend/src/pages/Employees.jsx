import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Search, UserPlus, CheckCircle2, AlertCircle, Download, Pencil, Mail } from 'lucide-react';
import { api } from '../lib/api';
import { STATUS_COLORS, inr, MONTHS, downloadCsv } from '../lib/utils';
import {
  Button, Card, CardContent, Input, Label, Badge, Dialog,
  Table, THead, TBody, TR, TH, TD, Spinner, Empty,
} from '../components/ui';

const SAMPLE_FALLBACK = { years: '1' };

export default function Employees() {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(null);
  const [edit, setEdit] = useState(null); // employee being edited
  const [editErr, setEditErr] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [company, setCompany] = useState({});
  const [emailDlg, setEmailDlg] = useState(null); // employee to email
  const [emailTpl, setEmailTpl] = useState('');
  const [emailMsg, setEmailMsg] = useState(null);
  const fileRef = useRef();

  const load = (query = '') => api.employees(query).then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); }, []);
  useEffect(() => {
    api.templates().then(setTemplates).catch(() => setTemplates([]));
    api.getSetting('company').then(setCompany).catch(() => setCompany({}));
  }, []);
  useEffect(() => { const t = setTimeout(() => load(q), 250); return () => clearTimeout(t); }, [q]);

  async function doImport() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setBusy(true); setImportResult(null); setImportError(null);
    try {
      const res = await api.importEmployees(file);
      setImportResult(res);
      load();
    } catch (e) {
      setImportError({ message: e.message, details: e.details });
    } finally {
      setBusy(false);
    }
  }

  async function showHistory(emp) {
    const h = await api.employeeHistory(emp.id);
    setHistory({ emp, rows: h });
  }

  function openEmail(emp) {
    setEmailDlg(emp); setEmailMsg(null);
    setEmailTpl(templates.find((t) => t.name !== 'salary-slip')?.name || templates[0]?.name || '');
  }

  async function sendEmail() {
    if (!emailTpl) return;
    setBusy(true); setEmailMsg(null);
    try {
      const res = await api.sendEmployeeEmail(emailDlg.id, emailTpl);
      setEmailMsg({ ok: true, text: res.dev ? `Prepared (dev mode - not actually sent). Configure SMTP to send for real.` : `Sent to ${res.to}` });
    } catch (e) {
      setEmailMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  }

  // fill {placeholders} for the live preview using the selected employee
  function fillFor(emp, str) {
    if (!emp) return str;
    const d = new Date();
    let years = SAMPLE_FALLBACK.years;
    if (emp.date_of_joining) { const doj = new Date(emp.date_of_joining); if (!Number.isNaN(doj.getTime())) years = String(Math.max(0, d.getFullYear() - doj.getFullYear())); }
    const vars = {
      name: emp.full_name, company: company.name || 'Your Company', designation: emp.designation || '',
      department: emp.department || '', date_of_joining: emp.date_of_joining || '', years,
      month: MONTHS[d.getMonth()], year: d.getFullYear(), net_pay: '—',
    };
    return String(str || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{${k}}`));
  }

  async function saveEdit() {
    setBusy(true); setEditErr(null);
    try {
      await api.updateEmployee(edit.id, {
        full_name: edit.full_name, email: edit.email, dob: edit.dob,
        designation: edit.designation, department: edit.department,
        date_of_joining: edit.date_of_joining, status: edit.status,
      });
      setEdit(null);
      load(q);
    } catch (e) {
      setEditErr({ message: e.message, details: e.details });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Employees</h1>
          <p className="text-sm text-muted-foreground">Imported via CSV · used for slip generation and PDF passwords</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => downloadCsv('employees-template.csv',
            ['employee_id', 'full_name', 'email', 'dob', 'designation', 'department', 'date_of_joining', 'status'],
            [
              ['EMP001', 'Asha Verma', 'asha@example.com', '1996-04-18', 'Engineer', 'Engineering', '2022-01-10', 'active'],
              ['EMP002', 'Rohan Gupta', 'rohan@example.com', '1992-11-02', 'Designer', 'Design', '2021-06-01', 'active'],
            ])}>
            <Download size={16} /> Download template
          </Button>
          <Button onClick={() => { setImportOpen(true); setImportResult(null); setImportError(null); }}>
            <UserPlus size={16} /> Import CSV
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search name, email or ID…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {!rows ? <div className="flex justify-center py-24"><Spinner className="h-8 w-8" /></div> : (
        <Card>
          <CardContent className="p-4">
            {rows.length === 0 ? (
              <Empty>
                <Upload size={20} />
                No employees yet. Import a CSV with columns: employee_id, full_name, email, dob, designation, department, date_of_joining, status
              </Empty>
            ) : (
              <Table>
                <THead>
                  <TR><TH>ID</TH><TH>Name</TH><TH>Email</TH><TH>Designation</TH><TH>Department</TH><TH>Status</TH><TH /></TR>
                </THead>
                <TBody>
                  <AnimatePresence>
                    {rows.map((e, i) => (
                      <motion.tr key={e.id} className="border-b transition-colors hover:bg-muted/40"
                        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}>
                        <TD className="font-mono text-xs">{e.employee_id}</TD>
                        <TD className="font-medium">{e.full_name}</TD>
                        <TD className="text-muted-foreground">{e.email}</TD>
                        <TD>{e.designation || '—'}</TD>
                        <TD>{e.department || '—'}</TD>
                        <TD><Badge className={STATUS_COLORS[e.status]}>{e.status}</Badge></TD>
                        <TD>
                          <div className="flex items-center gap-1">
                            <Button size="sm" variant="ghost" onClick={() => showHistory(e)}>History</Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8" title="Send email" onClick={() => openEmail(e)}>
                              <Mail size={14} />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8" title="Edit"
                              onClick={() => { setEdit({ ...e, dob: (e.dob || '').slice(0, 10) }); setEditErr(null); }}>
                              <Pencil size={14} />
                            </Button>
                          </div>
                        </TD>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={importOpen} onClose={() => setImportOpen(false)} title="Import employees (CSV)"
        description="Required columns: employee_id, full_name, email, dob (YYYY-MM-DD). Existing IDs are updated.">
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => downloadCsv('employees-template.csv',
              ['employee_id', 'full_name', 'email', 'dob', 'designation', 'department', 'date_of_joining', 'status'],
              [
                ['EMP001', 'Asha Verma', 'asha@example.com', '1996-04-18', 'Engineer', 'Engineering', '2022-01-10', 'active'],
                ['EMP002', 'Rohan Gupta', 'rohan@example.com', '1992-11-02', 'Designer', 'Design', '2021-06-01', 'active'],
              ])}
            className="flex w-full items-center justify-between rounded-lg border border-dashed border-primary/40 bg-accent/40 px-4 py-3 text-sm transition-colors hover:bg-accent"
          >
            <span>
              <span className="font-medium text-primary">Download template (CSV)</span>
              <span className="block text-xs text-muted-foreground">Fill your data in this exact format, then upload it below</span>
            </span>
            <Download size={16} className="text-primary" />
          </button>
          <Input ref={fileRef} type="file" accept=".csv" />
          {importError && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              <div className="flex items-center gap-2 font-medium"><AlertCircle size={15} /> {importError.message}</div>
              {importError.details && (
                <ul className="mt-2 max-h-36 list-disc overflow-auto pl-5 text-xs">
                  {importError.details.map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              )}
            </motion.div>
          )}
          {importResult && (
            <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              <div>
                <div className="flex items-center gap-2"><CheckCircle2 size={15} /> Imported: {importResult.inserted} new, {importResult.updated} updated</div>
                {importResult.autoMapped?.length > 0 && (
                  <div className="mt-1 text-xs text-violet-700">AI auto-mapped: {importResult.autoMapped.map((m) => `"${m.from}"→${m.to}`).join(', ')}</div>
                )}
              </div>
            </motion.div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setImportOpen(false)}>Close</Button>
            <Button onClick={doImport} disabled={busy}>{busy ? <Spinner className="h-4 w-4 border-white" /> : <Upload size={15} />} Import</Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={!!emailDlg} onClose={() => setEmailDlg(null)} wide
        title={emailDlg ? `Send email — ${emailDlg.full_name}` : ''}
        description={emailDlg ? `To: ${emailDlg.email}` : ''}>
        {emailDlg && (() => {
          const tpl = templates.find((t) => t.name === emailTpl);
          return (
            <div className="space-y-4">
              <div>
                <Label>Template</Label>
                <select value={emailTpl} onChange={(e) => setEmailTpl(e.target.value)}
                  className="flex h-9 w-full rounded-md border bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {templates.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                </select>
              </div>
              {tpl && (
                <div className="overflow-hidden rounded-lg border shadow-sm">
                  <div className="border-b bg-muted/60 px-4 py-2 text-xs">
                    <span className="text-muted-foreground">Subject: </span>
                    <span className="font-semibold">{fillFor(emailDlg, tpl.subject)}</span>
                  </div>
                  <div className="max-h-72 overflow-auto bg-white p-4 text-sm"
                    dangerouslySetInnerHTML={{ __html: fillFor(emailDlg, tpl.body_html) }} />
                </div>
              )}
              {emailMsg && (
                <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${emailMsg.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
                  {emailMsg.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />} {emailMsg.text}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setEmailDlg(null)}>Close</Button>
                <Button onClick={sendEmail} disabled={busy || !emailTpl}>
                  {busy ? <Spinner className="h-4 w-4 border-white" /> : <Mail size={15} />} Send
                </Button>
              </div>
            </div>
          );
        })()}
      </Dialog>

      <Dialog open={!!edit} onClose={() => setEdit(null)} title={edit ? `Edit — ${edit.full_name}` : ''}
        description={edit ? `Employee ID: ${edit.employee_id} (cannot be changed)` : ''}>
        {edit && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Full name</Label>
                <Input value={edit.full_name || ''} onChange={(e) => setEdit({ ...edit, full_name: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label>Email</Label>
                <Input type="email" value={edit.email || ''} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
              </div>
              <div>
                <Label>DOB (PDF password)</Label>
                <Input type="date" value={edit.dob || ''} onChange={(e) => setEdit({ ...edit, dob: e.target.value })} />
              </div>
              <div>
                <Label>Status</Label>
                <select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}
                  className="flex h-9 w-full rounded-md border bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <option value="active">active</option>
                  <option value="inactive">inactive</option>
                </select>
              </div>
              <div>
                <Label>Designation</Label>
                <Input value={edit.designation || ''} onChange={(e) => setEdit({ ...edit, designation: e.target.value })} />
              </div>
              <div>
                <Label>Department</Label>
                <Input value={edit.department || ''} onChange={(e) => setEdit({ ...edit, department: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label>Date of joining</Label>
                <Input type="date" value={edit.date_of_joining || ''} onChange={(e) => setEdit({ ...edit, date_of_joining: e.target.value })} />
              </div>
            </div>
            {editErr && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                <div className="flex items-center gap-2 font-medium"><AlertCircle size={15} /> {editErr.message}</div>
                {editErr.details && (
                  <ul className="mt-1 list-disc pl-5 text-xs">{editErr.details.map((d, i) => <li key={i}>{d}</li>)}</ul>
                )}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button>
              <Button onClick={saveEdit} disabled={busy}>
                {busy ? <Spinner className="h-4 w-4 border-white" /> : <CheckCircle2 size={15} />} Save changes
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog open={!!history} onClose={() => setHistory(null)} wide
        title={history ? `Salary history — ${history.emp.full_name}` : ''}>
        {history && (history.rows.length === 0 ? <Empty>No salary records yet</Empty> : (
          <Table>
            <THead><TR><TH>Month</TH><TH>Basic</TH><TH>HRA</TH><TH>Allowances</TH><TH>Deductions</TH><TH>Net pay</TH></TR></THead>
            <TBody>
              {history.rows.map((r) => (
                <TR key={r.id}>
                  <TD className="font-medium">{MONTHS[r.month - 1]} {r.year}</TD>
                  <TD>₹{inr(r.basic)}</TD><TD>₹{inr(r.hra)}</TD><TD>₹{inr(r.allowances)}</TD>
                  <TD className="text-rose-600">−₹{inr(r.deductions)}</TD>
                  <TD className="font-semibold">₹{inr(r.net_pay)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ))}
      </Dialog>
    </div>
  );
}
