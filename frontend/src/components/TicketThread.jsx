import { useState } from 'react';
import { Send, CheckCircle2 } from 'lucide-react';
import { Badge, Button, Spinner } from './ui';
import { STATUS_COLORS } from '../lib/utils';

const CAT_LABEL = { email: 'Email change', phone: 'Phone change', address: 'Address change', other: 'Other personal detail' };

// Reusable conversation view for a ticket. `isStaff` adds status controls.
export default function TicketThread({ ticket, onComment, onStatus, isStaff = false, aiTyping = false }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const closed = ticket.status === 'CLOSED';

  async function send() {
    if (!text.trim()) return;
    setBusy(true);
    try { await onComment(text.trim()); setText(''); } finally { setBusy(false); }
  }
  async function status(s, note) {
    setBusy(true);
    try { await onStatus(s, note); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="bg-primary/10 text-primary border-primary/20">{CAT_LABEL[ticket.category] || ticket.category}</Badge>
        <Badge className={STATUS_COLORS[ticket.status] || ''}>{ticket.status.replace('_', ' ')}</Badge>
        {isStaff && ticket.emp_email && <span className="text-xs text-muted-foreground">{ticket.full_name} · {ticket.emp_email}</span>}
      </div>

      <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border bg-muted/30 p-3">
        {(ticket.comments || []).map((c) => {
          const isEmp = c.author_role === 'employee';
          const isAi = c.author_role === 'assistant';
          const bubble = isEmp ? 'bg-primary text-primary-foreground'
            : isAi ? 'bg-orange-50 border border-orange-200 text-foreground' : 'bg-white border';
          const meta = isEmp ? 'text-primary-foreground/80' : isAi ? 'text-orange-600' : 'text-muted-foreground';
          return (
            <div key={c.id} className={`flex ${isEmp ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs ${bubble}`}>
                <div className={`mb-0.5 flex items-center gap-1 text-[10px] font-semibold ${meta}`}>
                  {isAi && <span aria-hidden>✨</span>}
                  {c.author_name || (isEmp ? 'You' : 'HR')} · {new Date(c.created_at).toLocaleString()}
                </div>
                <div className="whitespace-pre-wrap">{c.message}</div>
              </div>
            </div>
          );
        })}
        {aiTyping && (
          <div className="flex justify-start">
            <div className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-600">
              <span aria-hidden>✨</span> Maven is typing…
            </div>
          </div>
        )}
      </div>

      {closed ? (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">This request is closed. {isStaff ? '' : 'Raise a new request if you need further changes.'}</p>
      ) : (
        <div className="flex items-end gap-2">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Write a reply…"
            className="flex-1 rounded-md border bg-card px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <Button onClick={send} disabled={busy || !text.trim()}>{busy ? <Spinner className="h-4 w-4 border-white" /> : <Send size={15} />}</Button>
        </div>
      )}

      {isStaff && (
        <div className="flex flex-wrap gap-2 border-t pt-3">
          {ticket.status === 'OPEN' && <Button size="sm" variant="secondary" onClick={() => status('IN_PROGRESS')} disabled={busy}>Mark in progress</Button>}
          {!closed && <Button size="sm" variant="secondary" onClick={() => status('RESOLVED')} disabled={busy}>Mark resolved</Button>}
          {!closed && <Button size="sm" onClick={() => status('CLOSED', 'Request resolved and closed.')} disabled={busy}><CheckCircle2 size={14} /> Close ticket</Button>}
          {closed && <Button size="sm" variant="secondary" onClick={() => status('IN_PROGRESS')} disabled={busy}>Reopen</Button>}
        </div>
      )}
    </div>
  );
}
