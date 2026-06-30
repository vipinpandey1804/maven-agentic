import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, X, CalendarDays } from 'lucide-react';
import { api } from '../lib/api';
import { STATUS_COLORS } from '../lib/utils';
import { Button, Card, CardContent, Badge, Table, THead, TBody, TR, TH, TD, Spinner, Empty } from '../components/ui';

const FILTERS = [['PENDING', 'Pending'], ['APPROVED', 'Approved'], ['REJECTED', 'Rejected'], ['', 'All']];

export default function Leaves() {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState('PENDING');
  const [busy, setBusy] = useState('');

  const load = (f = filter) => api.leaves(f).then(setRows).catch(() => setRows([]));
  useEffect(() => { load(filter); }, [filter]);

  async function review(id, status) {
    let note = '';
    if (status === 'REJECTED') { note = prompt('Reason for rejection (optional):') || ''; }
    setBusy(id);
    try { await api.reviewLeave(id, status, note); load(filter); } catch (e) { alert(e.message); } finally { setBusy(''); }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Leave requests</h1>
        <p className="text-sm text-muted-foreground">Review and approve employee leave applications</p>
      </div>

      <div className="flex gap-2">
        {FILTERS.map(([v, label]) => (
          <button key={label} onClick={() => setFilter(v)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${filter === v ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent'}`}>
            {label}
          </button>
        ))}
      </div>

      {!rows ? <div className="flex justify-center py-16"><Spinner className="h-7 w-7" /></div> : (
        <Card><CardContent className="p-4">
          {rows.length === 0 ? <Empty><CalendarDays size={20} /> No {filter ? filter.toLowerCase() : ''} leave requests</Empty> : (
            <Table>
              <THead><TR><TH>Employee</TH><TH>Type</TH><TH>From</TH><TH>To</TH><TH>Days</TH><TH>Reason</TH><TH>Status</TH><TH /></TR></THead>
              <TBody>
                {rows.map((l, i) => (
                  <motion.tr key={l.id} className="border-b transition-colors hover:bg-muted/40"
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}>
                    <TD><span className="font-medium">{l.full_name}</span> <span className="font-mono text-xs text-muted-foreground">({l.emp_code})</span></TD>
                    <TD className="capitalize">{l.type}</TD>
                    <TD>{l.from_date}</TD><TD>{l.to_date}</TD><TD>{l.days}</TD>
                    <TD className="max-w-[180px] truncate text-muted-foreground" title={l.reason}>{l.reason || '—'}</TD>
                    <TD><Badge className={STATUS_COLORS[l.status] || ''}>{l.status}</Badge></TD>
                    <TD>
                      {l.status === 'PENDING' ? (
                        <div className="flex gap-1">
                          <Button size="sm" variant="success" disabled={busy === l.id} onClick={() => review(l.id, 'APPROVED')}><Check size={13} /> Approve</Button>
                          <Button size="sm" variant="destructive" disabled={busy === l.id} onClick={() => review(l.id, 'REJECTED')}><X size={13} /></Button>
                        </div>
                      ) : <span className="text-xs text-muted-foreground">{l.review_note || '—'}</span>}
                    </TD>
                  </motion.tr>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent></Card>
      )}
    </div>
  );
}
