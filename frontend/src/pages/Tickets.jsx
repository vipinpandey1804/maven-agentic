import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, Inbox } from 'lucide-react';
import { api } from '../lib/api';
import { STATUS_COLORS, cn } from '../lib/utils';
import { Card, CardContent, Badge, Dialog, Table, THead, TBody, TR, TH, TD, Spinner, Empty } from '../components/ui';
import TicketThread from '../components/TicketThread';

const FILTERS = [
  { v: '', label: 'All' },
  { v: 'OPEN', label: 'Open' },
  { v: 'IN_PROGRESS', label: 'In progress' },
  { v: 'RESOLVED', label: 'Resolved' },
  { v: 'CLOSED', label: 'Closed' },
];

export default function Tickets() {
  const [filter, setFilter] = useState('');
  const [list, setList] = useState(null);
  const [active, setActive] = useState(null);

  const load = () => api.tickets(filter).then(setList).catch(() => setList([]));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  async function openThread(id) { setActive(await api.ticket(id)); }
  async function comment(text) { const t = await api.commentTicket(active.id, text); setActive(t); load(); }
  async function status(s, note) { const t = await api.setTicketStatus(active.id, s, note); setActive(t); load(); }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Change requests</h1>
        <p className="text-sm text-muted-foreground">Personal-detail change requests raised by employees</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f.v} onClick={() => setFilter(f.v)}
            className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              filter === f.v ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground')}>
            {f.label}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="pt-6">
          {!list ? <div className="flex justify-center py-10"><Spinner /></div> : list.length === 0 ? (
            <Empty><Inbox className="mx-auto mb-2 opacity-40" /> No requests here</Empty>
          ) : (
            <Table>
              <THead><TR><TH>Employee</TH><TH>Subject</TH><TH>Type</TH><TH>Status</TH><TH>Updated</TH><TH></TH></TR></THead>
              <TBody>
                {list.map((t) => (
                  <motion.tr key={t.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    onClick={() => openThread(t.id)}
                    className="cursor-pointer border-b transition-colors hover:bg-muted/40">
                    <TD className="font-medium">{t.full_name}<div className="text-xs font-normal text-muted-foreground">{t.department || '—'}</div></TD>
                    <TD>{t.subject}</TD>
                    <TD className="capitalize">{t.category}</TD>
                    <TD><Badge className={STATUS_COLORS[t.status] || ''}>{t.status.replace('_', ' ')}</Badge></TD>
                    <TD className="text-xs text-muted-foreground">{new Date(t.updated_at).toLocaleDateString()}</TD>
                    <TD><span className="flex items-center gap-1 text-xs text-primary"><MessageSquare size={13} /> {t.comment_count}</span></TD>
                  </motion.tr>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!active} onClose={() => setActive(null)} title={active ? active.subject : ''} wide>
        {active && <TicketThread ticket={active} onComment={comment} onStatus={status} isStaff />}
      </Dialog>
    </div>
  );
}
