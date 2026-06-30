import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Check, CalendarDays, Inbox, IndianRupee, FileText, Shield, UserPlus, Cake, Sparkles } from 'lucide-react';
import { api } from '../lib/api';

const ICON = {
  leave: CalendarDays, ticket: Inbox, salary: IndianRupee, payslip: FileText,
  account: UserPlus, security: Shield, employees: UserPlus, system: Sparkles, birthday: Cake,
};

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef(null);
  const navigate = useNavigate();

  const loadCount = () => api.notifUnread().then((r) => setUnread(r.count)).catch(() => {});
  const loadList = () => api.notifications().then(setItems).catch(() => setItems([]));

  useEffect(() => {
    loadCount();
    const iv = setInterval(loadCount, 30000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) loadList();
  }

  async function openItem(n) {
    if (!n.read) { try { await api.notifRead(n.id); } catch {} }
    setOpen(false);
    loadCount();
    if (n.link) navigate(n.link);
  }

  async function readAll() {
    try { await api.notifReadAll(); } catch {}
    setItems((xs) => xs.map((x) => ({ ...x, read: 1 })));
    setUnread(0);
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={toggle} className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
        <Bell size={19} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.98 }}
            className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <span className="text-sm font-semibold">Notifications</span>
              {items.some((x) => !x.read) && (
                <button onClick={readAll} className="flex items-center gap-1 text-xs text-primary hover:underline"><Check size={13} /> Mark all read</button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {items.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">You're all caught up 🎉</div>
              ) : items.map((n) => {
                const Icon = ICON[n.type] || Bell;
                return (
                  <button key={n.id} onClick={() => openItem(n)}
                    className={`flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-accent ${n.read ? '' : 'bg-primary/5'}`}>
                    <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${n.read ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'}`}>
                      <Icon size={15} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{n.title}</span>
                        {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                      </div>
                      {n.body && <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>}
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{timeAgo(n.created_at)}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
