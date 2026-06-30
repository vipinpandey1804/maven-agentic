import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { api, getUser, setUser } from '../lib/api';
import { Button, Card, CardContent, Input, Label } from '../components/ui';

export default function ChangePassword() {
  const navigate = useNavigate();
  const user = getUser();
  const forced = !!user?.mustChangePassword;
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (next.length < 6) return setError('New password must be at least 6 characters');
    if (next !== confirm) return setError('New password and confirmation do not match');
    setLoading(true);
    try {
      await api.changePassword(current, next);
      setUser({ ...user, mustChangePassword: false });
      navigate(user?.role === 'employee' ? '/me' : '/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-background to-violet-50 p-4">
      <motion.div initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 22 }} className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <ShieldCheck size={26} />
          </div>
          <h1 className="text-xl font-bold">{forced ? 'Set a new password' : 'Change password'}</h1>
          <p className="px-4 text-center text-sm text-muted-foreground">
            {forced
              ? 'For security, please replace your temporary password before continuing.'
              : 'Update the password for your account.'}
          </p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label>Current password</Label>
                <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)}
                  placeholder={forced ? 'your email address' : '••••••••'} required autoFocus />
                {forced && <p className="mt-1 text-xs text-muted-foreground">Your temporary password is your email address.</p>}
              </div>
              <div>
                <Label>New password</Label>
                <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="min 6 characters" required />
              </div>
              <div>
                <Label>Confirm new password</Label>
                <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
              </div>
              {error && <motion.p initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                className="text-sm font-medium text-destructive">{error}</motion.p>}
              <Button className="w-full" disabled={loading}>
                <KeyRound size={15} /> {loading ? 'Saving…' : 'Save new password'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
