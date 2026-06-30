import { useState } from 'react';
import { CalendarClock } from 'lucide-react';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ORD = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

export function parseCron(cron) {
  const def = { freq: 'monthly', dom: 1, dow: 1, hour: 9, minute: 0 };
  if (!cron) return def;
  const p = String(cron).trim().split(/\s+/);
  if (p.length !== 5) return def;
  const [m, h, dom, , dow] = p;
  const minute = Number(m) || 0, hour = Number(h) || 0;
  if (dom !== '*') return { freq: 'monthly', dom: Number(dom) || 1, dow: 1, hour, minute };
  if (dow !== '*') return { freq: 'weekly', dom: 1, dow: Number(dow) || 0, hour, minute };
  return { freq: 'daily', dom: 1, dow: 1, hour, minute };
}
export function buildCron({ freq, dom, dow, hour, minute }) {
  if (freq === 'daily') return `${minute} ${hour} * * *`;
  if (freq === 'weekly') return `${minute} ${hour} * * ${dow}`;
  return `${minute} ${hour} ${dom} * *`;
}
export function humanize(cron) {
  const s = parseCron(cron);
  const h12 = `${(s.hour % 12) || 12}:${String(s.minute).padStart(2, '0')} ${s.hour < 12 ? 'AM' : 'PM'}`;
  if (s.freq === 'daily') return `Every day at ${h12}`;
  if (s.freq === 'weekly') return `Every ${WEEKDAYS[s.dow]} at ${h12}`;
  return `On the ${ORD(s.dom)} of every month at ${h12}`;
}

// Controlled: value = cron string, onChange(cronString)
export default function SchedulePicker({ value, onChange }) {
  const [s, setS] = useState(() => parseCron(value));
  const update = (patch) => { const next = { ...s, ...patch }; setS(next); onChange(buildCron(next)); };
  const time = `${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`;
  const sel = 'h-9 rounded-md border bg-card px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Run</span>
        <select className={sel} value={s.freq} onChange={(e) => update({ freq: e.target.value })}>
          <option value="daily">daily</option>
          <option value="weekly">weekly</option>
          <option value="monthly">monthly</option>
        </select>
        {s.freq === 'monthly' && (
          <>
            <span className="text-sm text-muted-foreground">on day</span>
            <select className={sel} value={s.dom} onChange={(e) => update({ dom: Number(e.target.value) })}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{ORD(d)}</option>)}
            </select>
          </>
        )}
        {s.freq === 'weekly' && (
          <>
            <span className="text-sm text-muted-foreground">on</span>
            <select className={sel} value={s.dow} onChange={(e) => update({ dow: Number(e.target.value) })}>
              {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </>
        )}
        <span className="text-sm text-muted-foreground">at</span>
        <input type="time" className={sel} value={time}
          onChange={(e) => { const [hh, mm] = e.target.value.split(':'); update({ hour: Number(hh), minute: Number(mm) }); }} />
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarClock size={13} /> {humanize(buildCron(s))}</p>
    </div>
  );
}
