import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Settings as SettingsIcon, LogOut, ChevronDown } from 'lucide-react';
import { getUser, getRole, setToken, setUser } from '../lib/api';

const ROLE_LABEL = { admin: 'Admin', ca: 'CA', hr: 'HR / Administration', employee: 'Employee' };

export default function ProfileMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  const user = getUser();
  const role = getRole();
  const email = user?.email || '';
  const initials = (email[0] || 'U').toUpperCase();

  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function signOut() { setToken(null); setUser(null); navigate('/login'); }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border bg-card py-1 pl-1 pr-2.5 text-sm transition-colors hover:bg-accent">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{initials}</span>
        <span className="hidden max-w-[140px] truncate font-medium sm:inline">{email}</span>
        <ChevronDown size={15} className="text-muted-foreground" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }}
            className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border bg-card shadow-xl">
            <div className="border-b px-4 py-3">
              <div className="truncate text-sm font-semibold">{email}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">Signed in as <span className="font-medium uppercase text-foreground">{ROLE_LABEL[role] || role}</span></div>
            </div>
            <div className="p-1.5">
              <Link to="/profile" onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                <User size={16} /> Profile
              </Link>
              {role === 'admin' && (
                <Link to="/settings" onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                  <SettingsIcon size={16} /> Settings
                </Link>
              )}
              <button onClick={signOut}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-600">
                <LogOut size={16} /> Sign out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
