import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Pencil, Mail, CheckCircle2, AlertCircle } from 'lucide-react';
import { api, getRole } from '../lib/api';
import { MONTHS } from '../lib/utils';
import { Card, CardContent, Button, Input, Label, Dialog, Spinner, Empty } from '../components/ui';
import EmployeeOverview from '../components/EmployeeOverview';

export default function EmployeeDetail() {
  const { id } = useParams();
  const [data, setData] = useState(undefined); // undefined=loading, null=not found
  const canManage = ['admin', 'hr'].includes(getRole());

  const [edit, setEdit] = useState(null);
  const [editErr, setEditErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const [templates, setTemplates] = useState([]);
  const [company, setCompany] = useState({});
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTpl, setEmailTpl] = useState('');
  const [emailMsg, setEmailMsg] = useState(null);

  const load = () => api.employeeOverview(id).then(setData).catch(() => setData(null));
  useEffect(() => { load(); }, [id]);
  useEffect(() => {
    if (!canManage) return;
    api.templates().then(setTemplates).catch(() => setTemplates([]));
    api.getSetting('company').then(setCompany).catch(() => setCompany({}));
  }, [canManage]);

  const e = data && data.employee;

  function openEdit() { setEdit({ ...e, dob: (e.dob || '').slice(0, 10) }); setEditErr(null); }
  async function saveEdit() {
    setBusy(true); setEditErr(null);
    try {
      await api.updateEmployee(edit.id, {
        full_name: edit.full_name, email: edit.email, dob: edit.dob,
        designation: edit.designation, department: edit.department,
        date_of_joining: edit.date_of_joining, status: edit.status,
      });
      setEdit(null); load();
    } catch (err) { setEditErr({ message: err.message, details: err.details }); }
    finally { setBusy(false); }
  }

  function openEmail() {
    setEmailMsg(null);
    setEmailTpl(templates.find((t) => t.name !== 'salary-slip')?.name || templates[0]?.name || '');
    setEmailOpen(true);
  }
  function fillFor(str) {
    if (!e) return str;
    const d = new Date();
    let years = '1';
    if (e.date_of_joining) { const doj = new Date(e.date_of_joining); if (!Number.isNaN(doj.getTime())) years = String(Math.max(0, d.getFullYear() - doj.getFullYear())); }
    const vars = { name: e.full_name, company: company.name || 'Your Company', designation: e.designation || '', department: e.department || '', date_of_joining: e.date_of_joining || '', years, month: MONTHS[d.getMonth()], year: d.getFullYear(), net_pay: '—' };
    return String(str || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{${k}}`));
  }
  async function sendEmail() {
    if (!emailTpl) return;
    setBusy(true); setEmailMsg(null);
    try {
      const res = await api.sendEmployeeEmail(e.id, emailTpl);
      setEmailMsg({ ok: true, text: res.dev ? 'Prepared (dev mode - configure SMTP to send for real).' : `Sent to ${res.to}` });
    } catch (err) { setEmailMsg({ ok: false, text: err.message }); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Link to="/employees" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={15} /> All employees
        </Link>
        {canManage && e && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={openEmail}><Mail size={15} /> Send email</Button>
            <Button onClick={openEdit}><Pencil size={15} /> Edit details</Button>
          </div>
        )}
      </div>

      {data === undefined ? (
        <div className="flex justify-center py-24"><Spinner className="h-8 w-8" /></div>
      ) : !data ? (
        <Empty>Employee not found</Empty>
      ) : (
        <Card><CardContent className="p-6"><EmployeeOverview data={data} /></CardContent></Card>
      )}

      {/* Edit */}
      <Dialog open={!!edit} onClose={() => setEdit(null)} title={edit ? `Edit — ${edit.full_name}` : ''}
        description={edit ? `Employee ID: ${edit.employee_id} (cannot be changed)` : ''}>
        {edit && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>Full name</Label><Input value={edit.full_name || ''} onChange={(ev) => setEdit({ ...edit, full_name: ev.target.value })} /></div>
              <div className="col-span-2"><Label>Email</Label><Input type="email" value={edit.email || ''} onChange={(ev) => setEdit({ ...edit, email: ev.target.value })} /></div>
              <div><Label>DOB (PDF password)</Label><Input type="date" value={edit.dob || ''} onChange={(ev) => setEdit({ ...edit, dob: ev.target.value })} /></div>
              <div><Label>Status</Label>
                <select value={edit.status} onChange={(ev) => setEdit({ ...edit, status: ev.target.value })}
                  className="flex h-9 w-full rounded-md border bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <option value="active">active</option><option value="inactive">inactive</option>
                </select>
              </div>
              <div><Label>Designation</Label><Input value={edit.designation || ''} onChange={(ev) => setEdit({ ...edit, designation: ev.target.value })} /></div>
              <div><Label>Department</Label><Input value={edit.department || ''} onChange={(ev) => setEdit({ ...edit, department: ev.target.value })} /></div>
              <div className="col-span-2"><Label>Date of joining</Label><Input type="date" value={edit.date_of_joining || ''} onChange={(ev) => setEdit({ ...edit, date_of_joining: ev.target.value })} /></div>
            </div>
            {editErr && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                <div className="flex items-center gap-2 font-medium"><AlertCircle size={15} /> {editErr.message}</div>
                {editErr.details && <ul className="mt-1 list-disc pl-5 text-xs">{editErr.details.map((d, i) => <li key={i}>{d}</li>)}</ul>}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button>
              <Button onClick={saveEdit} disabled={busy}>{busy ? <Spinner className="h-4 w-4 border-white" /> : <CheckCircle2 size={15} />} Save changes</Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Send email */}
      <Dialog open={emailOpen} onClose={() => setEmailOpen(false)} wide
        title={e ? `Send email — ${e.full_name}` : ''} description={e ? `To: ${e.email}` : ''}>
        {e && (() => {
          const tpl = templates.find((t) => t.name === emailTpl);
          return (
            <div className="space-y-4">
              <div>
                <Label>Template</Label>
                <select value={emailTpl} onChange={(ev) => setEmailTpl(ev.target.value)}
                  className="flex h-9 w-full rounded-md border bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {templates.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                </select>
              </div>
              {tpl && (
                <div className="overflow-hidden rounded-lg border shadow-sm">
                  <div className="border-b bg-muted/60 px-4 py-2 text-xs"><span className="text-muted-foreground">Subject: </span><span className="font-semibold">{fillFor(tpl.subject)}</span></div>
                  <div className="max-h-72 overflow-auto bg-white p-4 text-sm" dangerouslySetInnerHTML={{ __html: fillFor(tpl.body_html) }} />
                </div>
              )}
              {emailMsg && (
                <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${emailMsg.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
                  {emailMsg.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />} {emailMsg.text}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setEmailOpen(false)}>Close</Button>
                <Button onClick={sendEmail} disabled={busy || !emailTpl}>{busy ? <Spinner className="h-4 w-4 border-white" /> : <Mail size={15} />} Send</Button>
              </div>
            </div>
          );
        })()}
      </Dialog>
    </div>
  );
}
