import { useEffect, useState } from 'react';
import { Plus, MessageSquare } from 'lucide-react';
import { api } from '../lib/api';
import { STATUS_COLORS } from '../lib/utils';
import { Card, CardContent, CardHeader, CardTitle, Button, Input, Label, Badge, Dialog, Table, THead, TBody, TR, TH, TD, Spinner, Empty } from './ui';
import TicketThread from './TicketThread';

const CATEGORIES = [
  { v: 'email', label: 'Email change' },
  { v: 'phone', label: 'Phone change' },
  { v: 'address', label: 'Address change' },
  { v: 'other', label: 'Other personal detail' },
];

export default function MyTicketsPanel() {
  const [list, setList] = useState(null);
  const [openNew, setOpenNew] = useState(false);
  const [form, setForm] = useState({ category: 'email', subject: '', message: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [active, setActive] = useState(null); // open ticket thread
  const [aiTyping, setAiTyping] = useState(false);

  const load = () => api.myTickets().then(setList).catch(() => setList([]));
  useEffect(() => { load(); }, []);

  async function create() {
    if (!form.subject.trim() || !form.message.trim()) { setMsg({ ok: false, text: 'Subject and details are required' }); return; }
    setBusy(true); setMsg(null);
    try {
      await api.createTicket(form);
      setOpenNew(false); setForm({ category: 'email', subject: '', message: '' });
      load();
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(false); }
  }

  // AI replies in the background; poll a few times to surface it
  function pollForAi(id, prevCount) {
    setAiTyping(true);
    let tries = 0;
    const iv = setInterval(async () => {
      tries++;
      try {
        const fresh = await api.myTicket(id);
        if ((fresh.comments?.length || 0) > prevCount) { setActive(fresh); load(); setAiTyping(false); clearInterval(iv); return; }
      } catch { /* ignore */ }
      if (tries >= 6) { setAiTyping(false); clearInterval(iv); }
    }, 1500);
  }

  async function openThread(id) { setActive(await api.myTicket(id)); }
  async function comment(text) {
    const t = await api.commentMyTicket(active.id, text);
    setActive(t); load();
    pollForAi(active.id, t.comments?.length || 0); // wait for Maven's reply
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Personal detail change requests</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Raise a request to update your email, phone or address. Maven (AI) will help gather details; HR reviews and approves the change.</p>
          </div>
          <Button onClick={() => { setOpenNew(true); setMsg(null); }}><Plus size={16} /> New request</Button>
        </div>
      </CardHeader>
      <CardContent>
        {!list ? <div className="flex justify-center py-8"><Spinner /></div> : list.length === 0 ? (
          <Empty>No requests yet</Empty>
        ) : (
          <Table>
            <THead><TR><TH>Subject</TH><TH>Type</TH><TH>Status</TH><TH>Updated</TH><TH></TH></TR></THead>
            <TBody>
              {list.map((t) => (
                <TR key={t.id} className="cursor-pointer" onClick={() => openThread(t.id)}>
                  <TD className="font-medium">{t.subject}</TD>
                  <TD className="capitalize">{t.category}</TD>
                  <TD><Badge className={STATUS_COLORS[t.status] || ''}>{t.status.replace('_', ' ')}</Badge></TD>
                  <TD className="text-xs text-muted-foreground">{new Date(t.updated_at).toLocaleDateString()}</TD>
                  <TD><span className="flex items-center gap-1 text-xs text-primary"><MessageSquare size={13} /> {t.comment_count}</span></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardContent>

      {/* new request */}
      <Dialog open={openNew} onClose={() => setOpenNew(false)} title="Request a change">
        <div className="space-y-3">
          <div>
            <Label>What do you want to change?</Label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="flex h-9 w-full rounded-md border bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {CATEGORIES.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
            </select>
          </div>
          <div><Label>Subject</Label><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="e.g. Update my phone number" /></div>
          <div>
            <Label>Details</Label>
            <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={4}
              placeholder="Describe the change (e.g. new phone number, new address)…"
              className="w-full rounded-md border bg-card px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
          {msg && <p className={`text-xs ${msg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{msg.text}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpenNew(false)}>Cancel</Button>
            <Button onClick={create} disabled={busy}>{busy ? <Spinner className="h-4 w-4 border-white" /> : <Plus size={15} />} Submit</Button>
          </div>
        </div>
      </Dialog>

      {/* thread */}
      <Dialog open={!!active} onClose={() => { setActive(null); setAiTyping(false); }} title={active ? active.subject : ''} wide>
        {active && <TicketThread ticket={active} onComment={comment} aiTyping={aiTyping} />}
      </Dialog>
    </Card>
  );
}
