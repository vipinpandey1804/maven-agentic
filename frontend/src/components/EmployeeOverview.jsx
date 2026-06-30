import { FileText, IndianRupee, CalendarDays, Inbox, Mail, Briefcase, Calendar, Cake, Shield } from 'lucide-react';
import { inr, STATUS_COLORS } from '../lib/utils';
import { Badge, Table, THead, TBody, TR, TH, TD, Empty } from './ui';

const ROLE_LABEL = { admin: 'Admin', ca: 'CA', hr: 'HR / Administration', employee: 'Employee' };

function Stat({ icon, label, value }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</div>
      <div><div className="text-base font-bold leading-tight">{value}</div><div className="text-[11px] text-muted-foreground">{label}</div></div>
    </div>
  );
}

export default function EmployeeOverview({ data }) {
  if (!data) return null;
  const { employee: e, account, slips, leaves, tickets, summary } = data;
  const Row = ({ icon, value }) => <div className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">{icon}</span>{value}</div>;

  return (
    <div className="space-y-5">
      {/* identity */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold">{e.full_name}</h3>
            <span className="font-mono text-xs text-muted-foreground">{e.employee_id}</span>
            <Badge className={STATUS_COLORS[e.status]}>{e.status}</Badge>
          </div>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            <Row icon={<Briefcase size={14} />} value={`${e.designation || '—'} · ${e.department || '—'}`} />
            <Row icon={<Mail size={14} />} value={e.email} />
            <Row icon={<Cake size={14} />} value={`DOB ${(e.dob || '').slice(0, 10) || '—'}`} />
            <Row icon={<Calendar size={14} />} value={`Joined ${e.date_of_joining || '—'}`} />
          </div>
        </div>
        <div className="rounded-lg border bg-muted/40 p-2.5 text-xs">
          <div className="mb-1 flex items-center gap-1.5 font-semibold"><Shield size={13} /> Login account</div>
          {account ? (
            <>
              <div>{account.email}</div>
              <div className="text-muted-foreground">Role: {ROLE_LABEL[account.role] || account.role}{account.must_change_password ? ' · temp password' : ''}</div>
            </>
          ) : <div className="text-muted-foreground">No login account</div>}
        </div>
      </div>

      {/* stats */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat icon={<FileText size={17} />} label="Payslips" value={summary.slipCount} />
        <Stat icon={<IndianRupee size={17} />} label="Net paid (this year)" value={`₹${inr(summary.ytdNet)}`} />
        <Stat icon={<CalendarDays size={17} />} label="Approved leave days" value={summary.leaveApprovedDays} />
        <Stat icon={<Inbox size={17} />} label="Open requests" value={summary.openTickets} />
      </div>

      {/* salary history */}
      <section>
        <h4 className="mb-2 text-sm font-semibold">Salary history</h4>
        {slips.length === 0 ? <Empty>No payslips yet</Empty> : (
          <Table>
            <THead><TR><TH>Month</TH><TH>Basic</TH><TH>HRA</TH><TH>Allow.</TH><TH>Deduct.</TH><TH>LOP</TH><TH>Net pay</TH></TR></THead>
            <TBody>
              {slips.map((s) => (
                <TR key={s.id}>
                  <TD className="font-medium">{s.month_name} {s.year}</TD>
                  <TD>₹{inr(s.basic)}</TD><TD>₹{inr(s.hra)}</TD><TD>₹{inr(s.allowances)}</TD>
                  <TD className="text-rose-600">−₹{inr(s.deductions)}</TD><TD>{s.lop_days}</TD>
                  <TD className="font-semibold">₹{inr(s.net_pay)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>

      {/* leaves */}
      <section>
        <h4 className="mb-2 text-sm font-semibold">Leave requests {summary.pendingLeaves > 0 && <span className="text-amber-600">· {summary.pendingLeaves} pending</span>}</h4>
        {leaves.length === 0 ? <Empty>No leave requests</Empty> : (
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
      </section>

      {/* tickets */}
      <section>
        <h4 className="mb-2 text-sm font-semibold">Change requests</h4>
        {tickets.length === 0 ? <Empty>No requests raised</Empty> : (
          <Table>
            <THead><TR><TH>Subject</TH><TH>Type</TH><TH>Status</TH><TH>Updated</TH></TR></THead>
            <TBody>
              {tickets.map((t) => (
                <TR key={t.id}>
                  <TD className="font-medium">{t.subject}</TD><TD className="capitalize">{t.category}</TD>
                  <TD><Badge className={STATUS_COLORS[t.status] || ''}>{t.status.replace('_', ' ')}</Badge></TD>
                  <TD className="text-xs text-muted-foreground">{new Date(t.updated_at).toLocaleDateString()}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>
    </div>
  );
}
