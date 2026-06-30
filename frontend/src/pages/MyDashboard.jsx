import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { IndianRupee, FileText, Briefcase, Calendar, Cake, Mail, CalendarDays, BarChart3, LineChart as LineIcon, PieChart as PieIcon, AreaChart as AreaIcon } from 'lucide-react';
import { api } from '../lib/api';
import { inr, MONTHS, STATUS_COLORS, isBirthday } from '../lib/utils';
import { Card, CardContent, CardHeader, CardTitle, Badge, Button, Input, Label, Table, THead, TBody, TR, TH, TD, Spinner, Empty } from '../components/ui';
import InsightChart, { PALETTE } from '../components/InsightChart';
import BirthdayCelebration from '../components/BirthdayCelebration';

const LEAVE_TYPES = ['casual', 'sick', 'earned', 'unpaid'];

const TYPE_ICON = { area: AreaIcon, line: LineIcon, bar: BarChart3, pie: PieIcon, donut: PieIcon };
const TYPE_LABEL = { area: 'Area', line: 'Line', bar: 'Bar', pie: 'Pie', donut: 'Donut' };

export default function MyDashboard() {
  const [data, setData] = useState(null);
  const [slips, setSlips] = useState(null);
  const [leaves, setLeaves] = useState(null);
  const [form, setForm] = useState({ type: 'casual', from_date: '', to_date: '', reason: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState('');

  // chart controls
  const [metric, setMetric] = useState('trend');
  const [chartType, setChartType] = useState('area');

  const loadLeaves = () => api.myLeaves().then(setLeaves).catch(() => setLeaves([]));
  useEffect(() => {
    api.meDashboard().then(setData).catch((e) => setError(e.message));
    api.mePayslips().then(setSlips).catch(() => setSlips([]));
    loadLeaves();
  }, []);

  async function applyLeave() {
    if (!form.from_date || !form.to_date) { setMsg({ ok: false, text: 'Pick from and to dates' }); return; }
    setBusy(true); setMsg(null);
    try {
      await api.applyLeave(form);
      setForm({ type: 'casual', from_date: '', to_date: '', reason: '' });
      setMsg({ ok: true, text: 'Leave request submitted' });
      loadLeaves();
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(false); }
  }

  if (error) return <Empty>{error}</Empty>;
  if (!data) return <div className="flex justify-center py-24"><Spinner className="h-8 w-8" /></div>;

  const p = data.profile;
  const stat = (icon, label, value) => (
    <Card><CardContent className="flex items-center gap-3 p-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">{icon}</div>
      <div><div className="text-lg font-bold leading-tight">{value}</div><div className="text-xs text-muted-foreground">{label}</div></div>
    </CardContent></Card>
  );

  // ---- chart datasets (client-side) ----
  const trendData = (slips || []).slice().reverse().map((s) => ({
    name: `${(s.month_name || MONTHS[s.month - 1] || '').slice(0, 3)} ${String(s.year).slice(2)}`,
    net: Number(s.net_pay || 0),
  }));
  const latest = slips && slips[0];
  const breakupData = latest ? [
    { name: 'Basic', value: Number(latest.basic || 0) },
    { name: 'HRA', value: Number(latest.hra || 0) },
    { name: 'Allowances', value: Number(latest.allowances || 0) },
    { name: 'Deductions', value: Number(latest.deductions || 0) },
  ].filter((d) => d.value > 0) : [];
  const leaveCounts = (leaves || []).reduce((a, l) => { a[l.status] = (a[l.status] || 0) + 1; return a; }, {});
  const leaveData = Object.entries(leaveCounts).map(([name, value]) => ({ name, value }));

  const METRICS = {
    trend: { label: 'Net pay trend', types: ['area', 'line', 'bar'], data: trendData, xKey: 'name',
      series: [{ key: 'net', label: 'Net pay', color: PALETTE[0] }], fmt: (v) => `₹${inr(v)}` },
    breakup: { label: 'Latest salary breakup', types: ['donut', 'pie', 'bar'], data: breakupData, xKey: 'name',
      series: [{ key: 'value', label: 'Amount', color: PALETTE[0] }], fmt: (v) => `₹${inr(v)}` },
    leaves: { label: 'Leaves by status', types: ['donut', 'pie', 'bar'], data: leaveData, xKey: 'name',
      series: [{ key: 'value', label: 'Requests', color: PALETTE[1] }], fmt: (v) => `${v}` },
  };
  const m = METRICS[metric];
  const allowed = m.types;
  const effType = allowed.includes(chartType) ? chartType : allowed[0];

  function pickMetric(key) {
    setMetric(key);
    const next = METRICS[key].types;
    if (!next.includes(chartType)) setChartType(next[0]);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Hi, {p.full_name.split(' ')[0]} 👋</h1>
        <p className="text-sm text-muted-foreground">Your personal dashboard</p>
      </div>

      {isBirthday(p.dob) && <BirthdayCelebration name={p.full_name.split(' ')[0]} />}

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="grid gap-4 sm:grid-cols-3">
        {stat(<FileText size={20} />, 'Payslips available', data.slipCount)}
        {stat(<IndianRupee size={20} />, `Net paid this year (${new Date().getFullYear()})`, `₹${inr(data.ytdNet)}`)}
        {stat(<IndianRupee size={20} />, 'Latest net pay', data.latest ? `₹${inr(data.latest.net_pay)}` : '—')}
      </motion.div>

      {/* Insights — user picks metric + chart type */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>Insights</CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <select value={metric} onChange={(e) => pickMetric(e.target.value)}
                  className="h-9 rounded-md border bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {Object.entries(METRICS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <div className="flex gap-1 rounded-lg bg-muted p-1">
                  {allowed.map((t) => {
                    const Icon = TYPE_ICON[t];
                    const active = t === effType;
                    return (
                      <button key={t} onClick={() => setChartType(t)} title={TYPE_LABEL[t]}
                        className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${active ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground'}`}>
                        <Icon size={14} /> <span className="hidden sm:inline">{TYPE_LABEL[t]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <InsightChart
              type={effType === 'donut' ? 'pie' : effType}
              donut={effType === 'donut'}
              data={m.data} xKey={m.xKey} series={m.series} valueFormatter={m.fmt} height={300}
            />
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid gap-4 lg:grid-cols-3">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="h-full">
            <CardHeader><CardTitle>My profile</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center gap-2"><Briefcase size={15} className="text-muted-foreground" /> {p.designation || '—'} · {p.department || '—'}</div>
              <div className="flex items-center gap-2"><Mail size={15} className="text-muted-foreground" /> {p.email}</div>
              <div className="flex items-center gap-2"><Cake size={15} className="text-muted-foreground" /> DOB {(p.dob || '').slice(0, 10) || '—'}</div>
              <div className="flex items-center gap-2"><Calendar size={15} className="text-muted-foreground" /> Joined {p.date_of_joining || '—'}</div>
              <div className="flex items-center gap-2"><span className="text-muted-foreground">ID</span> <span className="font-mono text-xs">{p.employee_id}</span></div>
              <div className="pt-1"><Badge className={STATUS_COLORS[p.status]}>{p.status}</Badge></div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div className="lg:col-span-2" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card>
            <CardHeader><CardTitle>My payslips</CardTitle></CardHeader>
            <CardContent>
              {!slips ? <div className="flex justify-center py-8"><Spinner /></div> : slips.length === 0 ? (
                <Empty>No payslips issued yet</Empty>
              ) : (
                <Table>
                  <THead><TR><TH>Month</TH><TH>Basic</TH><TH>HRA</TH><TH>Allowances</TH><TH>Deductions</TH><TH>Net pay</TH><TH>Status</TH></TR></THead>
                  <TBody>
                    {slips.map((s) => (
                      <TR key={s.id}>
                        <TD className="font-medium">{s.month_name} {s.year}</TD>
                        <TD>₹{inr(s.basic)}</TD><TD>₹{inr(s.hra)}</TD><TD>₹{inr(s.allowances)}</TD>
                        <TD className="text-rose-600">−₹{inr(s.deductions)}</TD>
                        <TD className="font-semibold">₹{inr(s.net_pay)}</TD>
                        <TD>{s.send_status ? <Badge className={STATUS_COLORS[s.send_status]}>{s.send_status}</Badge> : <Badge className={STATUS_COLORS[s.batch_status]}>{s.batch_status}</Badge>}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
              <p className="mt-3 text-xs text-muted-foreground">Slip PDFs are emailed to you (password = your DOB in DDMMYYYY). Ask Maven for any details.</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <Card className="h-full">
            <CardHeader><CardTitle>Apply for leave</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Type</Label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="flex h-9 w-full rounded-md border bg-card px-3 text-sm shadow-sm capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {LEAVE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>From</Label><Input type="date" value={form.from_date} onChange={(e) => setForm({ ...form, from_date: e.target.value })} /></div>
                <div><Label>To</Label><Input type="date" value={form.to_date} onChange={(e) => setForm({ ...form, to_date: e.target.value })} /></div>
              </div>
              <div><Label>Reason</Label><Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="optional" /></div>
              {msg && <p className={`text-xs ${msg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{msg.text}</p>}
              <Button onClick={applyLeave} disabled={busy}>{busy ? <Spinner className="h-4 w-4 border-white" /> : <CalendarDays size={15} />} Submit request</Button>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div className="lg:col-span-2" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card>
            <CardHeader><CardTitle>My leave requests</CardTitle></CardHeader>
            <CardContent>
              {!leaves ? <div className="flex justify-center py-6"><Spinner /></div> : leaves.length === 0 ? (
                <Empty>No leave requests yet</Empty>
              ) : (
                <Table>
                  <THead><TR><TH>Type</TH><TH>From</TH><TH>To</TH><TH>Days</TH><TH>Status</TH></TR></THead>
                  <TBody>
                    {leaves.map((l) => (
                      <TR key={l.id}>
                        <TD className="capitalize">{l.type}</TD><TD>{l.from_date}</TD><TD>{l.to_date}</TD><TD>{l.days}</TD>
                        <TD><Badge className={STATUS_COLORS[l.status] || ''}>{l.status}</Badge></TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
