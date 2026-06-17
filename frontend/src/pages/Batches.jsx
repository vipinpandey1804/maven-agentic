import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Download } from 'lucide-react';
import { api } from '../lib/api';
import { inr, MONTHS, STATUS_COLORS, downloadCsv } from '../lib/utils';
import { Button, Card, CardContent, Input, Label, Badge, Dialog, Spinner, Empty } from '../components/ui';

export default function Batches() {
  const [batches, setBatches] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const fileRef = useRef();
  const navigate = useNavigate();

  const load = () => api.batches().then(setBatches).catch(() => setBatches([]));
  useEffect(() => { load(); }, []);

  async function doUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setBusy(true); setResult(null); setError(null);
    try {
      const res = await api.uploadSalary(file, month, year);
      setResult(res);
      load();
    } catch (e) {
      setError({ message: e.message, details: e.details });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Salary Batches</h1>
          <p className="text-sm text-muted-foreground">Upload the monthly sheet → review → approve → slips go out</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => downloadCsv('salary-sheet-template.csv',
            ['employee_id', 'basic', 'hra', 'allowances', 'deductions', 'lop_days', 'net_pay'],
            [
              ['EMP001', 50000, 20000, 5000, 5000, 0, 70000],
              ['EMP002', 40000, 16000, 4000, 4000, 1, 56000],
            ])}>
            <Download size={16} /> Download template
          </Button>
          <Button onClick={() => { setOpen(true); setResult(null); setError(null); }}>
            <Upload size={16} /> Upload salary sheet
          </Button>
        </div>
      </div>

      {!batches ? <div className="flex justify-center py-24"><Spinner className="h-8 w-8" /></div> : (
        batches.length === 0 ? (
          <Card><CardContent><Empty>
            <FileSpreadsheet size={22} />
            No batches yet. Upload an Excel/CSV with columns: employee_id, basic, hra, allowances, deductions, lop_days, net_pay
          </Empty></CardContent></Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {batches.map((b, i) => (
              <motion.div key={b.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, type: 'spring', stiffness: 260, damping: 24 }}>
                <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => navigate(`/batches/${b.id}`)}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-lg font-semibold">{MONTHS[b.month - 1]} {b.year}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          uploaded {new Date(b.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <Badge className={STATUS_COLORS[b.status]}>{b.status.replaceAll('_', ' ')}</Badge>
                    </div>
                    <div className="mt-4 flex items-end justify-between">
                      <div className="text-sm text-muted-foreground">{b.employee_count} employees</div>
                      <div className="text-xl font-bold">₹{inr(b.total_net_pay)}</div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title="Upload monthly salary sheet"
        description="Excel (.xlsx) or CSV. Columns: employee_id, basic, hra, allowances, deductions, lop_days, net_pay.">
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => downloadCsv('salary-sheet-template.csv',
              ['employee_id', 'basic', 'hra', 'allowances', 'deductions', 'lop_days', 'net_pay'],
              [
                ['EMP001', 50000, 20000, 5000, 5000, 0, 70000],
                ['EMP002', 40000, 16000, 4000, 4000, 1, 56000],
              ])}
            className="flex w-full items-center justify-between rounded-lg border border-dashed border-primary/40 bg-accent/40 px-4 py-3 text-sm transition-colors hover:bg-accent"
          >
            <span>
              <span className="font-medium text-primary">Download template (CSV)</span>
              <span className="block text-xs text-muted-foreground">HR fills salary data in this exact format, then uploads it below</span>
            </span>
            <Download size={16} className="text-primary" />
          </button>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Month</Label>
              <select value={month} onChange={(e) => setMonth(Number(e.target.value))}
                className="flex h-9 w-full rounded-md border bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <Label>Year</Label>
              <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
            </div>
          </div>
          <Input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" />
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              <div className="flex items-center gap-2 font-medium"><AlertCircle size={15} /> {error.message}</div>
              {error.details && (
                <ul className="mt-2 max-h-36 list-disc overflow-auto pl-5 text-xs">
                  {error.details.map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              )}
            </div>
          )}
          {result && (
            <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
              className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2 size={15} /> Batch created — {result.employeeCount} employees, ₹{inr(result.totalNetPay)}
              </div>
              {result.autoMapped?.length > 0 && (
                <p className="mt-2 text-xs text-violet-700">
                  AI auto-mapped columns: {result.autoMapped.map((m) => `"${m.from}"→${m.to}`).join(', ')}
                </p>
              )}
              {result.anomalies?.length > 0 && (
                <div className="mt-2 rounded border border-amber-300 bg-amber-100/60 p-2 text-xs text-amber-800">
                  <span className="font-medium">⚠ {result.anomalies.length} anomaly(ies) detected:</span>
                  <ul className="mt-1 list-disc pl-5">{result.anomalies.map((a, i) => <li key={i}>{a.message}</li>)}</ul>
                </div>
              )}
              {result.warnings?.length > 0 && (
                <ul className="mt-2 max-h-32 list-disc overflow-auto pl-5 text-xs text-amber-700">
                  {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              )}
              <Button size="sm" className="mt-3" onClick={() => navigate(`/batches/${result.batchId}`)}>
                Review &amp; approve →
              </Button>
            </motion.div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Close</Button>
            <Button onClick={doUpload} disabled={busy}>
              {busy ? <Spinner className="h-4 w-4 border-white" /> : <Upload size={15} />} Upload
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
