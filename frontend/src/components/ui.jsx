// shadcn/ui-style primitives (Button, Card, Input, Badge, Table, Dialog, Switch, Tabs)
import { forwardRef, createContext, useContext, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '../lib/utils';

/* ---------- Button ---------- */
const buttonVariants = {
  default: 'bg-primary text-primary-foreground shadow hover:opacity-90',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-accent',
  outline: 'border bg-card hover:bg-accent',
  ghost: 'hover:bg-accent',
  destructive: 'bg-destructive text-white shadow hover:opacity-90',
  success: 'bg-emerald-600 text-white shadow hover:bg-emerald-700',
};
export const Button = forwardRef(function Button({ className, variant = 'default', size = 'default', ...props }, ref) {
  const sizes = { default: 'h-9 px-4 py-2', sm: 'h-8 px-3 text-xs', lg: 'h-10 px-6', icon: 'h-9 w-9' };
  return (
    <motion.button
      ref={ref}
      whileTap={{ scale: 0.97 }}
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
        buttonVariants[variant], sizes[size], className
      )}
      {...props}
    />
  );
});

/* ---------- Card ---------- */
export const Card = ({ className, ...p }) => (
  <div className={cn('rounded-xl border bg-card text-card-foreground shadow-sm', className)} {...p} />
);
export const CardHeader = ({ className, ...p }) => <div className={cn('flex flex-col gap-1.5 p-6', className)} {...p} />;
export const CardTitle = ({ className, ...p }) => <h3 className={cn('font-semibold leading-none tracking-tight', className)} {...p} />;
export const CardDescription = ({ className, ...p }) => <p className={cn('text-sm text-muted-foreground', className)} {...p} />;
export const CardContent = ({ className, ...p }) => <div className={cn('p-6 pt-0', className)} {...p} />;

/* ---------- Input / Label ---------- */
export const Input = forwardRef(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-md border bg-card px-3 py-1 text-sm shadow-sm transition-colors',
        'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:opacity-50 file:border-0 file:bg-transparent file:text-sm file:font-medium', className
      )}
      {...props}
    />
  );
});
export const Label = ({ className, ...p }) => (
  <label className={cn('text-sm font-medium leading-none mb-1.5 block', className)} {...p} />
);

/* ---------- Badge ---------- */
export const Badge = ({ className, ...p }) => (
  <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium', className)} {...p} />
);

/* ---------- Table ---------- */
export const Table = ({ className, ...p }) => (
  <div className="w-full overflow-auto rounded-lg border">
    <table className={cn('w-full caption-bottom text-sm', className)} {...p} />
  </div>
);
export const THead = ({ className, ...p }) => <thead className={cn('bg-muted/60 [&_tr]:border-b', className)} {...p} />;
export const TBody = ({ className, ...p }) => <tbody className={cn('[&_tr:last-child]:border-0', className)} {...p} />;
export const TR = ({ className, ...p }) => <tr className={cn('border-b transition-colors hover:bg-muted/40', className)} {...p} />;
export const TH = ({ className, ...p }) => <th className={cn('h-10 px-4 text-left align-middle font-medium text-muted-foreground', className)} {...p} />;
export const TD = ({ className, ...p }) => <td className={cn('px-4 py-2.5 align-middle', className)} {...p} />;

/* ---------- Dialog ---------- */
export function Dialog({ open, onClose, title, description, children, wide }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className={cn('relative z-10 w-full rounded-xl border bg-card p-6 shadow-2xl', wide ? 'max-w-3xl' : 'max-w-md')}
          >
            <button onClick={onClose} className="absolute right-4 top-4 text-muted-foreground hover:text-foreground">
              <X size={16} />
            </button>
            {title && <h2 className="text-lg font-semibold">{title}</h2>}
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
            <div className="mt-4">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ---------- Switch ---------- */
export function Switch({ checked, onCheckedChange, disabled }) {
  return (
    <button
      type="button" disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn('relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
        checked ? 'bg-primary' : 'bg-muted-foreground/30', disabled && 'opacity-50')}
    >
      <motion.span
        layout transition={{ type: 'spring', stiffness: 600, damping: 32 }}
        className={cn('inline-block h-4 w-4 rounded-full bg-white shadow', checked ? 'ml-[18px]' : 'ml-0.5')}
      />
    </button>
  );
}

/* ---------- Tabs ---------- */
const TabsCtx = createContext(null);
export function Tabs({ defaultValue, children, className }) {
  const [value, setValue] = useState(defaultValue);
  return <TabsCtx.Provider value={{ value, setValue }}><div className={className}>{children}</div></TabsCtx.Provider>;
}
export function TabsList({ children }) {
  return <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-1">{children}</div>;
}
export function TabsTrigger({ value, children }) {
  const ctx = useContext(TabsCtx);
  const active = ctx.value === value;
  return (
    <button
      onClick={() => ctx.setValue(value)}
      className={cn('relative rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
        active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}
    >
      {active && (
        <motion.span layoutId="tab-pill" className="absolute inset-0 rounded-md bg-card shadow-sm"
          transition={{ type: 'spring', stiffness: 500, damping: 35 }} />
      )}
      <span className="relative z-10">{children}</span>
    </button>
  );
}
export function TabsContent({ value, children }) {
  const ctx = useContext(TabsCtx);
  if (ctx.value !== value) return null;
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      {children}
    </motion.div>
  );
}

/* ---------- Spinner / Empty ---------- */
export const Spinner = ({ className }) => (
  <div className={cn('h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent', className)} />
);
export const Empty = ({ children }) => (
  <div className="flex flex-col items-center justify-center gap-2 py-12 text-sm text-muted-foreground">{children}</div>
);
