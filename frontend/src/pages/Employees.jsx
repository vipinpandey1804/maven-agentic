import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Upload, Search, UserPlus, CheckCircle2, AlertCircle, Download, Eye } from 'lucide-react';
import { api, getRole } from '../lib/api';
import { STATUS_COLORS, downloadCsv } from '../lib/utils';
import { Button, Card, CardContent, Input, Badge, Dialog, Table, THead, TBody, TR, TH, TD, Spinner, Empty } from '../components/ui';

export default function Employees() {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState(null);
  const [busy, setBusy] = useState(false);
  const canManage = ['admin', 'hr'].includes(getRole()); // CA is read-only here
  const navigate = useNavigate();
  const fileRef = useRef();

  const load = (query = '') => api.employees(query).then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); }, []);
  useEffect(() => { const t = setTimeout(() => load(q), 250); return () => clearTimeout(t); }, [q]);

  async function doImport() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setBusy(true); setImportResult(null); setImportError(null);
    try { setImportResult(await api.importEmployees(file)); load(); }
    catch (e) { setImportError({ message: e.message, details: e.details }); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Employees</h1>
          <p className="text-sm text-muted-foreground">Imported via CSV · used for slip generation and PDF passwords</p>
        </div>
        {canManage && (
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
        )}
      </div>

      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search name, email or ID…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {!rows ? <div className="flex justify-center py-24"><Spinner className="h-8 w-8" /></div> : (
        <Card>
          <CardContent className="p-4">
            {rows.length === 0 ? (
              <Empty><Upload size={20} /> No employees yet. Import a CSV with columns: employee_id, full_name, email, dob, designation, department, date_of_joining, status</Empty>
            ) : (
              <Table>
                <THead>
                  <TR><TH>ID</TH><TH>Name</TH><TH>Email</TH><TH>DOB</TH><TH>Designation</TH><TH>Department</TH><TH>Status</TH><TH /></TR>
                </THead>
                <TBody>
                  <AnimatePresence>
                    {rows.map((e, i) => (
                      <motion.tr key={e.id} className="cursor-pointer border-b transition-colors hover:bg-muted/40"
                        onClick={() => navigate(`/employees/${e.id}`)}
                        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}>
                        <TD className="font-mono text-xs">{e.employee_id}</TD>
                        <TD className="font-medium">{e.full_name}</TD>
                        <TD className="text-muted-foreground">{e.email}</TD>
                        <TD className="whitespace-nowrap">{(e.dob || '').slice(0, 10) || '—'}</TD>
                        <TD>{e.designation || '—'}</TD>
                        <TD>{e.department || '—'}</TD>
                        <TD><Badge className={STATUS_COLORS[e.status]}>{e.status}</Badge></TD>
                        <TD>
                          <Button size="sm" variant="ghost" onClick={(ev) => { ev.stopPropagation(); navigate(`/employees/${e.id}`); }}>
                            <Eye size={14} /> View
                          </Button>
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
          <button type="button" onClick={() => downloadCsv('employees-template.csv',
            ['employee_id', 'full_name', 'email', 'dob', 'designation', 'department', 'date_of_joining', 'status'],
            [
              ['EMP001', 'Asha Verma', 'asha@example.com', '1996-04-18', 'Engineer', 'Engineering', '2022-01-10', 'active'],
              ['EMP002', 'Rohan Gupta', 'rohan@example.com', '1992-11-02', 'Designer', 'Design', '2021-06-01', 'active'],
            ])}
            className="flex w-full items-center justify-between rounded-lg border border-dashed border-primary/40 bg-accent/40 px-4 py-3 text-sm transition-colors hover:bg-accent">
            <span>
              <span className="font-medium text-primary">Download template (CSV)</span>
              <span className="block text-xs text-muted-foreground">Fill your data in this exact format, then upload it below</span>
            </span>
            <Download size={16} className="text-primary" />
          </button>
          <Input ref={fileRef} type="file" accept=".csv" />
          {importError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              <div className="flex items-center gap-2 font-medium"><AlertCircle size={15} /> {importError.message}</div>
              {importError.details && <ul className="mt-2 max-h-36 list-disc overflow-auto pl-5 text-xs">{importError.details.map((d, i) => <li key={i}>{d}</li>)}</ul>}
            </div>
          )}
          {importResult && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              <div className="flex items-center gap-2"><CheckCircle2 size={15} /> Imported: {importResult.inserted} new, {importResult.updated} updated{importResult.accountsCreated ? `, ${importResult.accountsCreated} login(s)` : ''}</div>
              {importResult.autoMapped?.length > 0 && <div className="mt-1 text-xs text-violet-700">AI auto-mapped: {importResult.autoMapped.map((m) => `"${m.from}"→${m.to}`).join(', ')}</div>}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setImportOpen(false)}>Close</Button>
            <Button onClick={doImport} disabled={busy}>{busy ? <Spinner className="h-4 w-4 border-white" /> : <Upload size={15} />} Import</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
