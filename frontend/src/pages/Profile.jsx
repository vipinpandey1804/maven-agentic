import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { User, Mail, Briefcase, Calendar, Cake, Shield, KeyRound, CheckCircle2 } from 'lucide-react';
import { api, getUser, setUser } from '../lib/api';
import { STATUS_COLORS, isBirthday } from '../lib/utils';
import { Card, CardContent, CardHeader, CardTitle, Badge, Button, Input, Label, Spinner } from '../components/ui';
import MyTicketsPanel from '../components/MyTicketsPanel';
import BirthdayCelebration from '../components/BirthdayCelebration';

const ROLE_LABEL = { admin: 'Admin', ca: 'CA', hr: 'HR / Administration', employee: 'Employee' };

export default function Profile() {
  const account = getUser();
  const [profile, setProfile] = useState(undefined); // undefined=loading, null=none
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    api.meProfile().then(setProfile).catch(() => setProfile(null));
  }, []);

  async function changePassword(e) {
    e.preventDefault();
    setMsg(null);
    if (pwd.next.length < 6) return setMsg({ ok: false, text: 'New password must be at least 6 characters' });
    if (pwd.next !== pwd.confirm) return setMsg({ ok: false, text: 'New password and confirmation do not match' });
    setBusy(true);
    try {
      await api.changePassword(pwd.current, pwd.next);
      setPwd({ current: '', next: '', confirm: '' });
      setMsg({ ok: true, text: 'Password updated' });
      if (account?.mustChangePassword) setUser({ ...account, mustChangePassword: false });
    } catch (err) { setMsg({ ok: false, text: err.message }); }
    finally { setBusy(false); }
  }

  const Row = ({ icon, label, value }) => (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium">{value || '—'}</span>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground">Your account details and password</p>
      </div>

      {profile && isBirthday(profile.dob) && <BirthdayCelebration name={(profile.full_name || '').split(' ')[0] || 'there'} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="h-full">
            <CardHeader><CardTitle className="flex items-center gap-2"><User size={17} /> Account</CardTitle></CardHeader>
            <CardContent className="space-y-2.5">
              <Row icon={<Mail size={15} />} label="Email" value={account?.email} />
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground"><Shield size={15} /></span>
                <span className="text-muted-foreground">Role:</span>
                <Badge className="bg-primary/10 text-primary border-primary/20">{ROLE_LABEL[account?.role] || account?.role}</Badge>
              </div>

              {profile === undefined ? (
                <div className="py-3"><Spinner /></div>
              ) : profile ? (
                <div className="mt-3 space-y-2.5 border-t pt-3">
                  <Row icon={<User size={15} />} label="Name" value={profile.full_name} />
                  <Row icon={<Briefcase size={15} />} label="Role" value={`${profile.designation || '—'} · ${profile.department || '—'}`} />
                  <Row icon={<Cake size={15} />} label="Date of birth" value={(profile.dob || '').slice(0, 10)} />
                  <Row icon={<Calendar size={15} />} label="Joined" value={profile.date_of_joining} />
                  <Row icon={<span className="text-xs font-mono">ID</span>} label="Employee ID" value={profile.employee_id} />
                  <div className="pt-1"><Badge className={STATUS_COLORS[profile.status]}>{profile.status}</Badge></div>
                </div>
              ) : (
                <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
                  This account isn't linked to an employee record. Personal details are managed by HR.
                </p>
              )}
              <p className="pt-1 text-xs text-muted-foreground">To update personal details (email, phone, address), raise a request below — HR will action it.</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="h-full">
            <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound size={17} /> Change password</CardTitle></CardHeader>
            <CardContent>
              {account?.mustChangePassword && (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  You're still using your temporary password (your email). Consider setting a new one.
                </div>
              )}
              <form onSubmit={changePassword} className="space-y-3">
                <div><Label>Current password</Label><Input type="password" value={pwd.current}
                  onChange={(e) => setPwd({ ...pwd, current: e.target.value })} required /></div>
                <div><Label>New password</Label><Input type="password" value={pwd.next}
                  onChange={(e) => setPwd({ ...pwd, next: e.target.value })} placeholder="min 6 characters" required /></div>
                <div><Label>Confirm new password</Label><Input type="password" value={pwd.confirm}
                  onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} required /></div>
                {msg && <p className={`text-xs ${msg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{msg.text}</p>}
                <Button disabled={busy}>{busy ? <Spinner className="h-4 w-4 border-white" /> : <CheckCircle2 size={15} />} Update password</Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <MyTicketsPanel />
    </div>
  );
}
