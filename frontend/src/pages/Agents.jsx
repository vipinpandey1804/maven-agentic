import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, Play, CalendarClock, Check } from 'lucide-react';
import { api } from '../lib/api';
import { Button, Card, CardContent, Switch, Spinner, Empty, Badge } from '../components/ui';

const DESCRIPTIONS = {
  'salary-slip-agent': 'Sends password-protected salary slip PDFs to every employee from the approved batch.',
};

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ORD = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

// cron (m h dom mon dow)  <->  friendly {freq, day, hour, minute}
function parseCron(cron) {
  const def = { freq: 'monthly', dom: 1, dow: 1, hour: 9, minute: 0 };
  if (!cron) return def;
  const p = cron.trim().split(/\s+/);
  if (p.length !== 5) return def;
  const [m, h, dom, , dow] = p;
  const minute = Number(m) || 0, hour = Number(h) || 0;
  if (dom !== '*' ) return { freq: 'monthly', dom: Number(dom) || 1, dow: 1, hour, minute };
  if (dow !== '*') return { freq: 'weekly', dom: 1, dow: Number(dow) || 0, hour, minute };
  return { freq: 'daily', dom: 1, dow: 1, hour, minute };
}
function buildCron({ freq, dom, dow, hour, minute }) {
  if (freq === 'daily') return `${minute} ${hour} * * *`;
  if (freq === 'weekly') return `${minute} ${hour} * * ${dow}`;
  return `${minute} ${hour} ${dom} * *`; // monthly
}
function humanize(s) {
  const t = `${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`;
  const h12 = ((s.hour % 12) || 12) + ':' + String(s.minute).padStart(2, '0') + ' ' + (s.hour < 12 ? 'AM' : 'PM');
  if (s.freq === 'daily') return `Every day at ${h12}`;
  if (s.freq === 'weekly') return `Every ${WEEKDAYS[s.dow]} at ${h12}`;
  return `On the ${ORD(s.dom)} of every month at ${h12}`;
}

function ScheduleEditor({ agent, onSave, busy }) {
  const [s, setS] = useState(() => parseCron(agent.cron_expression));
  const [dirty, setDirty] = useState(false);
  const set = (patch) => { setS((cur) => ({ ...cur, ...patch })); setDirty(true); };
  const time = `${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`;
  const sel = 'h-9 rounded-md border bg-card px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div className="mt-4 space-y-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center gap-2 text-sm font-medium"><CalendarClock size={15} className="text-primary" /> Schedule</div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Run</span>
        <select className={sel} value={s.freq} onChange={(e) => set({ freq: e.target.value })}>
          <option value="daily">daily</option>
          <option value="weekly">weekly</option>
          <option value="monthly">monthly</option>
        </select>

        {s.freq === 'monthly' && (
          <>
            <span className="text-sm text-muted-foreground">on day</span>
            <select className={sel} value={s.dom} onChange={(e) => set({ dom: Number(e.target.value) })}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{ORD(d)}</option>)}
            </select>
          </>
        )}
        {s.freq === 'weekly' && (
          <>
            <span className="text-sm text-muted-foreground">on</span>
            <select className={sel} value={s.dow} onChange={(e) => set({ dow: Number(e.target.value) })}>
              {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </>
        )}

        <span className="text-sm text-muted-foreground">at</span>
        <input type="time" className={sel} value={time}
          onChange={(e) => { const [hh, mm] = e.target.value.split(':'); set({ hour: Number(hh), minute: Number(mm) }); }} />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{humanize(s)}</p>
        {dirty && (
          <Button size="sm" disabled={busy} onClick={() => { onSave(buildCron(s)); setDirty(false); }}>
            {busy ? <Spinner className="h-3.5 w-3.5 border-white" /> : <Check size={14} />} Save schedule
          </Button>
        )}
      </div>
    </div>
  );
}

export default function Agents() {
  const [agents, setAgents] = useState(null);
  const [busy, setBusy] = useState('');
  const [runResult, setRunResult] = useState({});

  const load = () => api.agents().then(setAgents).catch(() => setAgents([]));
  useEffect(() => { load(); }, []);

  async function toggle(agent) {
    setBusy(agent.name);
    try { await api.putAgent(agent.name, { enabled: !agent.enabled }); await load(); } finally { setBusy(''); }
  }
  async function saveCron(agent, cron) {
    setBusy(agent.name);
    try { await api.putAgent(agent.name, { cron_expression: cron }); await load(); } finally { setBusy(''); }
  }
  async function run(agent) {
    setBusy(agent.name); setRunResult((r) => ({ ...r, [agent.name]: null }));
    try { const res = await api.runAgent(agent.name); setRunResult((r) => ({ ...r, [agent.name]: res })); }
    catch (e) { setRunResult((r) => ({ ...r, [agent.name]: { error: e.message } })); }
    finally { setBusy(''); }
  }

  if (!agents) return <div className="flex justify-center py-24"><Spinner className="h-8 w-8" /></div>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Agents</h1>
        <p className="text-sm text-muted-foreground">Automations that run on a schedule. Pick when each should run — no technical setup needed.</p>
      </div>

      {agents.length === 0 ? <Card><CardContent><Empty>No agents registered</Empty></CardContent></Card> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {agents.map((a, i) => (
            <motion.div key={a.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, type: 'spring', stiffness: 260, damping: 24 }}>
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <motion.div animate={a.enabled ? { scale: [1, 1.08, 1] } : {}} transition={{ repeat: Infinity, duration: 2.4 }}
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow ${a.enabled ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                        <Bot size={19} />
                      </motion.div>
                      <div>
                        <div className="font-semibold">{a.name}</div>
                        <p className="mt-0.5 text-xs text-muted-foreground">{DESCRIPTIONS[a.name] || 'Custom agent'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={a.enabled ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}>
                        {a.enabled ? 'scheduled' : 'paused'}
                      </Badge>
                      <Switch checked={!!a.enabled} disabled={busy === a.name} onCheckedChange={() => toggle(a)} />
                    </div>
                  </div>

                  <ScheduleEditor agent={a} busy={busy === a.name} onSave={(cron) => saveCron(a, cron)} />

                  <div className="mt-3 flex items-center justify-end">
                    <Button size="sm" variant="outline" disabled={busy === a.name} onClick={() => run(a)}>
                      {busy === a.name ? <Spinner className="h-3.5 w-3.5" /> : <Play size={14} />} Run now
                    </Button>
                  </div>

                  {runResult[a.name] && (
                    <motion.pre initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                      className="mt-3 overflow-auto rounded-lg bg-muted p-3 text-xs">
                      {JSON.stringify(runResult[a.name], null, 2)}
                    </motion.pre>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
