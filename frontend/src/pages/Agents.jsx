import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, Play, Clock } from 'lucide-react';
import { api } from '../lib/api';
import { Button, Card, CardContent, Input, Switch, Spinner, Empty, Badge } from '../components/ui';

const DESCRIPTIONS = {
  'salary-slip-agent': 'Sends password-protected salary slip PDFs to every employee from the approved batch. Runs on the 1st of each month.',
};

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
    setBusy(agent.name);
    setRunResult((r) => ({ ...r, [agent.name]: null }));
    try {
      const res = await api.runAgent(agent.name);
      setRunResult((r) => ({ ...r, [agent.name]: res }));
    } catch (e) {
      setRunResult((r) => ({ ...r, [agent.name]: { error: e.message } }));
    } finally {
      setBusy('');
    }
  }

  if (!agents) return <div className="flex justify-center py-24"><Spinner className="h-8 w-8" /></div>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Agents</h1>
        <p className="text-sm text-muted-foreground">
          Pluggable automations on the platform. New agents register in code and appear here automatically.
        </p>
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
                      <motion.div
                        animate={a.enabled ? { scale: [1, 1.08, 1] } : {}}
                        transition={{ repeat: Infinity, duration: 2.4 }}
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow ${a.enabled ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
                      >
                        <Bot size={19} />
                      </motion.div>
                      <div>
                        <div className="font-semibold">{a.name}</div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {DESCRIPTIONS[a.name] || 'Custom agent'}
                        </p>
                      </div>
                    </div>
                    <Switch checked={!!a.enabled} disabled={busy === a.name} onCheckedChange={() => toggle(a)} />
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <Clock size={14} className="text-muted-foreground" />
                    <Input
                      className="h-8 max-w-44 font-mono text-xs"
                      defaultValue={a.cron_expression || ''}
                      placeholder="cron e.g. 0 9 1 * *"
                      onBlur={(e) => e.target.value !== (a.cron_expression || '') && saveCron(a, e.target.value)}
                    />
                    <Badge className={a.enabled ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}>
                      {a.enabled ? 'scheduled' : 'paused'}
                    </Badge>
                    <div className="flex-1" />
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
