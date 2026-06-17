import { NavLink, Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LayoutDashboard, Users, FileSpreadsheet, Bot, Settings, LogOut, IndianRupee } from 'lucide-react';
import { setToken } from '../lib/api';
import { cn } from '../lib/utils';
import FloatingAssistant from './FloatingAssistant';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/employees', label: 'Employees', icon: Users },
  { to: '/batches', label: 'Salary Batches', icon: FileSpreadsheet },
  { to: '/agents', label: 'Agents', icon: Bot },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-20 flex w-60 flex-col border-r bg-card">
        <Link to="/" className="flex items-center gap-2.5 rounded-lg px-5 py-5 transition-opacity hover:opacity-80">
          <motion.div
            initial={{ rotate: -12, scale: 0.8 }} animate={{ rotate: 0, scale: 1 }}
            whileHover={{ rotate: -8, scale: 1.05 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow"
          >
            <IndianRupee size={18} />
          </motion.div>
          <div>
            <div className="text-sm font-bold leading-tight">PaySlip Agent</div>
            <div className="text-[11px] text-muted-foreground">Automation Platform</div>
          </div>
        </Link>
        <nav className="flex-1 space-y-1 px-3 py-2">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'}>
              {({ isActive }) => (
                <div className={cn(
                  'relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}>
                  {isActive && (
                    <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-lg bg-primary shadow"
                      transition={{ type: 'spring', stiffness: 500, damping: 38 }} />
                  )}
                  <Icon size={17} className="relative z-10" />
                  <span className="relative z-10">{label}</span>
                </div>
              )}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={() => { setToken(null); navigate('/login'); }}
          className="m-3 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-600"
        >
          <LogOut size={17} /> Sign out
        </button>
      </aside>

      <main className="ml-60 flex-1 px-8 py-7">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        >
          <Outlet />
        </motion.div>
      </main>

      <FloatingAssistant />
    </div>
  );
}
