import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Users, Send, AlertTriangle, IndianRupee, Activity, BarChart3, LineChart as LineIcon, PieChart as PieIcon, AreaChart as AreaIcon, Building2 } from 'lucide-react';
import { api } from '../lib/api';
import { inr, MONTHS, STATUS_COLORS } from '../lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Badge, Spinner, Empty } from '../components/ui';
import InsightChart, { PALETTE } from '../components/InsightChart';

const container = { animate: { transition: { staggerChildren: 0.07 } } };
const item = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 24 } },
};
const TYPE_ICON = { area: AreaIcon, line: LineIcon, bar: BarChart3, pie: PieIcon, donut: PieIcon };
const TYPE_LABEL = { area: 'Area', line: 'Line', bar: 'Bar', pie: 'Pie', donut: 'Donut' };

function TypeToggle({ types, value, onChange }) {
  return (
    <div className="flex gap-1 rounded-lg bg-muted p-1">
      {types.map((t) => {
        const Icon = TYPE_ICON[t];
        const active = t === value;
        return (
          <button key={t} onClick={() => onChange(t)} title={TYPE_LABEL[t]}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${active ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground'}`}>
            <Icon size={14} /> <span className="hidden sm:inline">{TYPE_LABEL[t]}</span>
          </button>
        );
      })}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, color }) {
  return (
    <motion.div variants={item}>
      <Card className="relative overflow-hidden">
        <div className={`absolute right-0 top-0 h-20 w-20 translate-x-6 -translate-y-6 rounded-full opacity-10 ${color}`} />
        <CardContent className="flex items-center gap-4 p-5">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow ${color}`}>
            <Icon size={20} />
          </div>
          <div>
            <div className="text-2xl font-bold leading-tight">{value}</div>
            <div className="text-xs text-muted-foreground">{label}{sub ? ` · ${sub}` : ''}</div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [employees, setEmployees] = useState(null);
  const [error, setError] = useState('');
  const [payoutType, setPayoutType] = useState('area');
  const [deptType, setDeptType] = useState('donut');

  useEffect(() => {
    api.dashboard().then(setData).catch((e) => setError(e.message));
    api.employees().then(setEmployees).catch(() => setEmployees([]));
  }, []);

  if (error) return <Empty>{error}</Empty>;
  if (!data) return <div className="flex justify-center py-24"><Spinner className="h-8 w-8" /></div>;

  const payoutData = data.payoutSeries.map((b) => ({
    name: `${MONTHS[b.month - 1]?.slice(0, 3)} ${String(b.year).slice(2)}`,
    payout: Number(b.total_net_pay || 0),
  }));
  const lastBatch = data.recentBatches[0];

  // headcount by department (client-side from employee list)
  const deptCounts = (employees || []).reduce((a, e) => {
    const d = e.department || 'Unassigned';
    a[d] = (a[d] || 0) + 1; return a;
  }, {});
  const deptData = Object.entries(deptCounts).map(([name, value]) => ({ name, value }));
  const moneyFmt = (v) => `₹${v >= 100000 ? (v / 100000).toFixed(1) + 'L' : inr(v)}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Salary slip automation at a glance</p>
      </div>

      <motion.div variants={container} initial="initial" animate="animate" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="Active employees" value={data.employees.active} sub={`${data.employees.total} total`} color="bg-indigo-500" />
        <StatCard icon={Send} label="Slips sent" value={data.sends.sent} color="bg-emerald-500" />
        <StatCard icon={AlertTriangle} label="Failed sends" value={data.sends.failed} sub={`${data.sends.queued} queued`} color="bg-rose-500" />
        <StatCard icon={IndianRupee} label="Last batch payout" value={lastBatch ? `₹${inr(lastBatch.total_net_pay)}` : '—'}
          sub={lastBatch ? `${MONTHS[lastBatch.month - 1]} ${lastBatch.year}` : 'no batches yet'} color="bg-violet-500" />
      </motion.div>

      <div className="grid gap-4 lg:grid-cols-3">
        <motion.div className="lg:col-span-2" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Monthly payout</CardTitle>
                  <CardDescription>Total net pay per salary batch</CardDescription>
                </div>
                <TypeToggle types={['area', 'line', 'bar']} value={payoutType} onChange={setPayoutType} />
              </div>
            </CardHeader>
            <CardContent>
              <InsightChart type={payoutType} data={payoutData} xKey="name"
                series={[{ key: 'payout', label: 'Payout', color: PALETTE[0] }]}
                valueFormatter={moneyFmt} height={264} />
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Activity size={16} /> Recent activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.recentActivity.length === 0 && <Empty>No activity yet</Empty>}
              {data.recentActivity.map((a, i) => (
                <motion.div key={a.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.35 + i * 0.05 }} className="flex items-start gap-2.5 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <div>
                    <div className="font-medium">{a.action.replaceAll('_', ' ').toLowerCase()}</div>
                    <div className="text-xs text-muted-foreground">
                      {a.actor_email || 'system'} · {new Date(a.created_at).toLocaleString()}
                    </div>
                  </div>
                </motion.div>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32 }}>
          <Card className="h-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2"><Building2 size={16} /> Headcount by department</CardTitle>
                <TypeToggle types={['donut', 'pie', 'bar']} value={deptType} onChange={setDeptType} />
              </div>
            </CardHeader>
            <CardContent>
              {!employees ? <div className="flex justify-center py-8"><Spinner /></div> : (
                <InsightChart type={deptType === 'donut' ? 'pie' : deptType} donut={deptType === 'donut'}
                  data={deptData} xKey="name" series={[{ key: 'value', label: 'Employees', color: PALETTE[1] }]}
                  valueFormatter={(v) => `${v}`} height={300} />
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div className="lg:col-span-2" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
          <Card>
            <CardHeader><CardTitle>Recent batches</CardTitle></CardHeader>
            <CardContent>
              {data.recentBatches.length === 0 ? <Empty>No salary batches yet — upload one from Salary Batches</Empty> : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {data.recentBatches.map((b) => (
                    <div key={b.id} className="flex items-center justify-between rounded-lg border p-3.5">
                      <div>
                        <div className="font-medium">{MONTHS[b.month - 1]} {b.year}</div>
                        <div className="text-xs text-muted-foreground">{b.employee_count} employees · ₹{inr(b.total_net_pay)}</div>
                      </div>
                      <Badge className={STATUS_COLORS[b.status]}>{b.status.replaceAll('_', ' ')}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
