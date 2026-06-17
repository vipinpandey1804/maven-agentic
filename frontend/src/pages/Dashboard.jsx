import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Users, Send, AlertTriangle, IndianRupee, Activity } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { api } from '../lib/api';
import { inr, MONTHS, STATUS_COLORS } from '../lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Badge, Spinner, Empty } from '../components/ui';

const container = { animate: { transition: { staggerChildren: 0.07 } } };
const item = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 24 } },
};

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
  const [error, setError] = useState('');

  useEffect(() => { api.dashboard().then(setData).catch((e) => setError(e.message)); }, []);

  if (error) return <Empty>{error}</Empty>;
  if (!data) return <div className="flex justify-center py-24"><Spinner className="h-8 w-8" /></div>;

  const chartData = data.payoutSeries.map((b) => ({
    name: `${MONTHS[b.month - 1]?.slice(0, 3)} ${String(b.year).slice(2)}`,
    payout: Number(b.total_net_pay || 0),
  }));
  const lastBatch = data.recentBatches[0];

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
              <CardTitle>Monthly payout</CardTitle>
              <CardDescription>Total net pay per salary batch</CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              {chartData.length === 0 ? <Empty>Upload a salary batch to see the trend</Empty> : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="payout" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis tickFormatter={(v) => `₹${v >= 100000 ? (v / 100000).toFixed(1) + 'L' : inr(v)}`}
                      tickLine={false} axisLine={false} fontSize={12} width={64} />
                    <Tooltip formatter={(v) => [`₹${inr(v)}`, 'Payout']} />
                    <Area type="monotone" dataKey="payout" stroke="#6366f1" strokeWidth={2.5} fill="url(#payout)"
                      animationDuration={900} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
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

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
        <Card>
          <CardHeader><CardTitle>Recent batches</CardTitle></CardHeader>
          <CardContent>
            {data.recentBatches.length === 0 ? <Empty>No salary batches yet — upload one from Salary Batches</Empty> : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
  );
}
