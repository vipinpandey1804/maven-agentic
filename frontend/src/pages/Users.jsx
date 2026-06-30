import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { UserPlus, Trash2, CheckCircle2, AlertCircle, KeyRound, Users2 } from 'lucide-react';
import { api } from '../lib/api';
import { cn } from '../lib/utils';
import { Button, Card, CardContent, Input, Label, Badge, Dialog, Table, THead, TBody, TR, TH, TD, Spinner, Empty } from '../components/ui';

const ROLES = [
  { v: 'admin', label: 'Admin — full access' },
  { v: 'ca', label: 'CA — uploads salary only' },
  { v: 'hr', label: 'HR / Administration' },
  { v: 'employee', label: 'Employee — self-service' },
];
const ROLE_COLORS = {
  admin: 'bg-violet-100 text-violet-700 border-violet-200',
  ca: 'bg-blue-100 text-blue-700 border-blue-200',
  hr: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  employee: 'bg-slate-100 text-slate-600 border-slate-200',
};

export default function Users() {
  const [users, setUsers] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', role: 'hr', employeeId: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [edit, setEdit] = useState(null);
  const [roleFilter, setRoleFilter] = useState('');

  const load = () => api.users().then(setUsers).catch(() => setUsers([]));
  useEffect(() => { load(); api.employees().then(setEmployees).catch(() => setEmployees([])); }, []);

  async function createUser() {
    setBusy(true); setMsg(null);
    try {
      await api.createUser({ email: form.email, password: form.password, role: form.role, employeeId: form.employeeId || undefined });
      setOpen(false); setForm({ email: '', password: '', role: 'hr', employeeId: '' });
      load();
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(false); }
  }

  async function backfillAccounts() {
    if (!confirm('Create logins for all imported employees that don\'t have one yet? Password will be their email (must change on first login).')) return;
    setBusy(true); setMsg(null);
    try {
      const r = await api.backfillEmployeeAccounts();
      setMsg({ ok: true, text: `Created ${r.created} login(s), skipped ${r.skipped} (already had one).` });
      load();
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(false); }
  }

  async function saveEdit() {
    setBusy(true); setMsg(null);
    try {
      await api.updateUser(edit.id, { role: edit.role, employeeId: edit.employee_id || undefined, password: edit.password || undefined });
      setEdit(null); load();
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(false); }
  }

  async function removeUser(u) {
    if (!confirm(`Delete user ${u.email}?`)) return;
    try { await api.deleteUser(u.id); load(); } catch (e) { setMsg({ ok: false, text: e.message }); }
  }

  if (!users) return <div className="flex justify-center py-16"><Spinner className="h-7 w-7" /></div>;

  const counts = users.reduce((a, u) => { a[u.role] = (a[u.role] || 0) + 1; return a; }, {});
  const FILTERS = [{ v: '', label: 'All' }, ...ROLES.map((r) => ({ v: r.v, label: r.v.toUpperCase() }))];
  const shown = roleFilter ? users.filter((u) => u.role === roleFilter) : users;

  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Users &amp; roles</h3>
            <p className="text-sm text-muted-foreground">Create logins and assign roles. Employee-role users must be linked to an employee.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={backfillAccounts} disabled={busy}><Users2 size={16} /> Backfill employee logins</Button>
            <Button onClick={() => { setOpen(true); setMsg(null); }}><UserPlus size={16} /> Add user</Button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button key={f.v} onClick={() => setRoleFilter(f.v)}
              className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                roleFilter === f.v ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground')}>
              {f.label} <span className="opacity-70">{f.v ? (counts[f.v] || 0) : users.length}</span>
            </button>
          ))}
        </div>

        {msg && !open && !edit && (
          <div className={`mb-3 flex items-center gap-2 rounded-lg border p-2 text-sm ${msg.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
            {msg.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />} {msg.text}
          </div>
        )}

        {shown.length === 0 ? <Empty>No users in this role</Empty> : (
          <Table>
            <THead><TR><TH>Email</TH><TH>Role</TH><TH>Linked employee</TH><TH /></TR></THead>
            <TBody>
              {shown.map((u, i) => (
                <motion.tr key={u.id} className="border-b transition-colors hover:bg-muted/40"
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                  <TD className="font-medium">{u.email}</TD>
                  <TD><Badge className={ROLE_COLORS[u.role]}>{u.role}</Badge></TD>
                  <TD className="text-muted-foreground">{u.employee_name || '—'}</TD>
                  <TD>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEdit({ ...u, password: '' })}>Edit</Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-rose-600" onClick={() => removeUser(u)}><Trash2 size={14} /></Button>
                    </div>
                  </TD>
                </motion.tr>
              ))}
            </TBody>
          </Table>
        )}
      </CardContent>

      {/* Add user */}
      <Dialog open={open} onClose={() => setOpen(false)} title="Add user">
        <div className="space-y-3">
          <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div>
            <Label>Password <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="leave blank = use email as password" />
            <p className="mt-1 text-xs text-muted-foreground">Leave blank to set the password to the user's email. They'll be required to change it on first login.</p>
          </div>
          <div>
            <Label>Role</Label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="flex h-9 w-full rounded-md border bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {ROLES.map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}
            </select>
          </div>
          {form.role === 'employee' && (
            <div>
              <Label>Link to employee</Label>
              <select value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                className="flex h-9 w-full rounded-md border bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="">— select employee —</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name} ({e.employee_id})</option>)}
              </select>
            </div>
          )}
          {msg && <div className="flex items-center gap-2 text-sm text-rose-600"><AlertCircle size={15} /> {msg.text}</div>}
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={createUser} disabled={busy}>{busy ? <Spinner className="h-4 w-4 border-white" /> : <UserPlus size={15} />} Create</Button></div>
        </div>
      </Dialog>

      {/* Edit user */}
      <Dialog open={!!edit} onClose={() => setEdit(null)} title={edit ? `Edit — ${edit.email}` : ''}>
        {edit && (
          <div className="space-y-3">
            <div>
              <Label>Role</Label>
              <select value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}
                className="flex h-9 w-full rounded-md border bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {ROLES.map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}
              </select>
            </div>
            {edit.role === 'employee' && (
              <div>
                <Label>Link to employee</Label>
                <select value={edit.employee_id || ''} onChange={(e) => setEdit({ ...edit, employee_id: e.target.value })}
                  className="flex h-9 w-full rounded-md border bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <option value="">— select employee —</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name} ({e.employee_id})</option>)}
                </select>
              </div>
            )}
            <div><Label className="flex items-center gap-1"><KeyRound size={13} /> Reset password (optional)</Label>
              <Input type="password" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} placeholder="leave blank to keep" /></div>
            {msg && <div className="flex items-center gap-2 text-sm text-rose-600"><AlertCircle size={15} /> {msg.text}</div>}
            <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button>
              <Button onClick={saveEdit} disabled={busy}>{busy ? <Spinner className="h-4 w-4 border-white" /> : <CheckCircle2 size={15} />} Save</Button></div>
          </div>
        )}
      </Dialog>
    </Card>
  );
}
