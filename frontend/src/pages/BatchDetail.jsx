import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, CheckCircle2, XCircle, Send, ShieldCheck, Flag, Download, ChevronUp, ChevronDown } from 'lucide-react';
import { api, getRole } from '../lib/api';
import { inr, MONTHS, STATUS_COLORS, downloadCsv } from '../lib/utils';
import {
  Button, Card, CardContent, CardHeader, CardTitle, Badge, Dialog, Input,
  Table, THead, TBody, TR, TH, TD, Spinner, Empty,
} from '../components/ui';

export default function BatchDetail() {
  const { id } = useParams();
  const [batch, setBatch] = useState(null);
  const [busy, setBusy] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [sendResult, setSendResult] = useState(null);
  const [error, setError] = useState('');
  const [flagDlg, setFlagDlg] = useState(null); // record being flagged
  const [flagReason, setFlagReason] = useState('');
  const [sending, setSending] = useState(null); // { done, total } while dispatching in background
  const [dl, setDl] = useState(null);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  const load = () => api.batch(id).then(setBatch).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id]);

  async function act(name, fn) {
    setBusy(name); setError(''); setSendResult(null);
    try {
      const res = await fn();
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }

  // Send runs in the BACKGROUND on the server; we poll the batch for live progress.
  async function sendNow() {
    setError(''); setSendResult(null); setBusy('send');
    try {
      const r = await api.sendBatch(id); // returns immediately: { started, total, pending }
      setSending({ done: 0, total: r.total || batch.records.length });
      const iv = setInterval(async () => {
        let b;
        try { b = await api.batch(id); } catch { return; }
        setBatch(b);
        const done = b.records.filter((x) => x.send_status === 'SENT').length;
        const failed = b.records.filter((x) => x.send_status === 'FAILED').length;
        setSending({ done, total: b.records.length });
        const finished = b.status === 'SENT' || b.records.every((x) => x.send_status === 'SENT' || x.send_status === 'FAILED');
        if (finished) {
          clearInterval(iv);
          setSending(null); setBusy('');
          setSendResult({ sent: done, failed, total: b.records.length });
        }
      }, 1500);
    } catch (e) {
      setError(e.message); setBusy(''); setSending(null);
    }
  }

  async function downloadSlip(r) {
    setDl(r.id);
    try { await api.downloadSlip(r.id, `SalarySlip-${MONTHS[batch.month - 1]}-${batch.year}-${r.emp_code}.pdf`); }
    catch (e) { setError(e.message); }
    finally { setDl(null); }
  }

  if (error && !batch) return <Empty>{error}</Empty>;
  if (!batch) return <div className="flex justify-center py-24"><Spinner className="h-8 w-8" /></div>;

  const canReview = ['admin', 'hr'].includes(getRole()); // CA is upload-only, never approves/sends
  const canApprove = canReview && batch.status === 'PENDING_APPROVAL';
  const canSend = canReview && (batch.status === 'APPROVED' || (batch.status === 'SENT' && batch.records.some((r) => r.send_status !== 'SENT')));
  const flagged = batch.records.filter((r) => r.flagged);

  const NUM_KEYS = ['basic', 'hra', 'allowances', 'deductions', 'lop_days', 'net_pay'];
  function toggleSort(k) { if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')); else { setSortKey(k); setSortDir('asc'); } }
  const sortedRecords = (() => {
    const rows = [...batch.records];
    if (!sortKey) return rows;
    rows.sort((a, b) => {
      if (NUM_KEYS.includes(sortKey)) return Number(a[sortKey] || 0) - Number(b[sortKey] || 0);
      const x = String(a[sortKey] || '').toLowerCase(), y = String(b[sortKey] || '').toLowerCase();
      return x < y ? -1 : x > y ? 1 : 0;
    });
    if (sortDir === 'desc') rows.reverse();
    return rows;
  })();
  const SortTH = ({ k, children, className }) => (
    <TH className={`cursor-pointer select-none hover:text-foreground ${className || ''}`} onClick={() => toggleSort(k)}>
      <span className="inline-flex items-center gap-1">{children}{sortKey === k && (sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}</span>
    </TH>
  );

  async function toggleFlag(rec) {
    if (rec.flagged) {
      await act('flag', () => api.flagRecord(rec.id, { flagged: false }));
    } else {
      setFlagDlg(rec); setFlagReason('');
    }
  }

  function exportFlagged() {
    downloadCsv(`flagged-${MONTHS[batch.month - 1]}-${batch.year}.csv`,
      ['employee_id', 'full_name', 'email', 'basic', 'hra', 'allowances', 'deductions', 'lop_days', 'net_pay', 'issue_reported_by_hr'],
      flagged.map((r) => [r.emp_code, `"${r.full_name}"`, r.email, r.basic, r.hra, r.allowances, r.deductions, r.lop_days, r.net_pay, `"${(r.flag_reason || '').replaceAll('"', "'")}"`]));
  }

  return (
    <div className="space-y-5">
      <Link to="/batches" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={15} /> All batches
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{MONTHS[batch.month - 1]} {batch.year}</h1>
            <Badge className={STATUS_COLORS[batch.status]}>{batch.status.replaceAll('_', ' ')}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {batch.employee_count} employees · total payout ₹{inr(batch.total_net_pay)}
            {batch.approved_at && ` · approved ${new Date(batch.approved_at).toLocaleString()}`}
          </p>
        </div>
        <div className="flex gap-2">
          {flagged.length > 0 && canReview && (
            <Button variant="outline" onClick={exportFlagged}>
              <Download size={15} /> Export flagged ({flagged.length})
            </Button>
          )}
          {canApprove && (
            <>
              <Button variant="destructive" disabled={!!busy} onClick={() => setRejectOpen(true)}>
                <XCircle size={15} /> Reject
              </Button>
              <Button variant="success" disabled={!!busy} onClick={() => act('approve', () => api.approveBatch(id))}>
                {busy === 'approve' ? <Spinner className="h-4 w-4 border-white" /> : <ShieldCheck size={15} />} Approve batch
              </Button>
            </>
          )}
          {canSend && (
            <Button disabled={!!busy} onClick={sendNow}>
              {busy === 'send' ? <Spinner className="h-4 w-4 border-white" /> : <Send size={15} />}
              {sending ? `Sending… ${sending.done}/${sending.total}` : 'Send slips now'}
            </Button>
          )}
        </div>
      </div>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {sending && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
          <div className="mb-1.5 flex items-center gap-2"><Spinner className="h-3.5 w-3.5" /> Sending slips in the background — {sending.done} of {sending.total} done…</div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-blue-100">
            <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${sending.total ? (sending.done / sending.total) * 100 : 0}%` }} />
          </div>
        </motion.div>
      )}
      {sendResult && !sending && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          <CheckCircle2 size={15} />
          Dispatch complete — {sendResult.sent} sent, {sendResult.failed} failed of {sendResult.total}.
          Emails use dev mode (jsonTransport) until SMTP is configured in Settings.
        </motion.div>
      )}
      {flagged.length > 0 && canApprove && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <Flag size={15} />
          {flagged.length} record(s) flagged as incorrect. Approval is blocked — export the flagged list, send it back for correction,
          then reject this batch and re-upload the fixed sheet (or clear the flags if resolved).
        </motion.div>
      )}
      {batch.reject_reason && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          Rejected: {batch.reject_reason}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>Salary records</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <SortTH k="full_name">Employee</SortTH><SortTH k="email">Email</SortTH>
                <SortTH k="basic">Basic</SortTH><SortTH k="hra">HRA</SortTH><SortTH k="allowances">Allowances</SortTH>
                <SortTH k="deductions">Deductions</SortTH><SortTH k="lop_days">LOP</SortTH><SortTH k="net_pay">Net pay</SortTH>
                <TH>Slip</TH>{canApprove && <TH />}
              </TR>
            </THead>
            <TBody>
              {sortedRecords.map((r, i) => (
                <motion.tr key={r.id}
                  className={`border-b transition-colors ${r.flagged ? 'bg-rose-50/70 hover:bg-rose-50' : 'hover:bg-muted/40'}`}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}>
                  <TD>
                    <span className="font-medium">{r.full_name}</span> <span className="font-mono text-xs text-muted-foreground">({r.emp_code})</span>
                    {r.flagged ? (
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-rose-600">
                        <Flag size={11} /> {r.flag_reason || 'marked incorrect'}
                      </span>
                    ) : null}
                  </TD>
                  <TD className="text-muted-foreground">{r.email}</TD>
                  <TD>₹{inr(r.basic)}</TD><TD>₹{inr(r.hra)}</TD><TD>₹{inr(r.allowances)}</TD>
                  <TD className="text-rose-600">−₹{inr(r.deductions)}</TD>
                  <TD>{r.lop_days || 0}</TD>
                  <TD className="font-semibold">₹{inr(r.net_pay)}</TD>
                  <TD>
                    <div className="flex items-center gap-2">
                      {r.send_status
                        ? <Badge className={STATUS_COLORS[r.send_status]}>{r.send_status}</Badge>
                        : <span className="text-xs text-muted-foreground">not sent</span>}
                      {['APPROVED', 'SENT'].includes(batch.status) && (
                        <Button size="sm" variant="ghost" disabled={dl === r.id} onClick={() => downloadSlip(r)} title="Download slip PDF">
                          {dl === r.id ? <Spinner className="h-3.5 w-3.5" /> : <Download size={14} />}
                        </Button>
                      )}
                    </div>
                  </TD>
                  {canApprove && (
                    <TD>
                      <Button size="sm" variant={r.flagged ? 'destructive' : 'ghost'}
                        className={r.flagged ? '' : 'text-muted-foreground'}
                        onClick={() => toggleFlag(r)} title={r.flagged ? 'Clear flag' : 'Mark as incorrect'}>
                        <Flag size={13} /> {r.flagged ? 'Unflag' : 'Flag'}
                      </Button>
                    </TD>
                  )}
                </motion.tr>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!flagDlg} onClose={() => setFlagDlg(null)}
        title={flagDlg ? `Flag — ${flagDlg.full_name} (${flagDlg.emp_code})` : ''}
        description="Mark this record as incorrect. It will be included in the flagged export for whoever prepared the sheet.">
        <div className="space-y-4">
          <Input placeholder="What is wrong? e.g. HRA should be 18000" value={flagReason}
            onChange={(e) => setFlagReason(e.target.value)} autoFocus />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setFlagDlg(null)}>Cancel</Button>
            <Button variant="destructive" disabled={!!busy}
              onClick={async () => {
                const rec = flagDlg; setFlagDlg(null);
                await act('flag', () => api.flagRecord(rec.id, { flagged: true, reason: flagReason }));
              }}>
              <Flag size={14} /> Flag record
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={rejectOpen} onClose={() => setRejectOpen(false)} title="Reject batch"
        description="The upload will be discarded; HR can re-upload a corrected sheet.">
        <div className="space-y-4">
          <Input placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={!!busy}
              onClick={async () => { setRejectOpen(false); await act('reject', () => api.rejectBatch(id, reason)); }}>
              Reject batch
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
