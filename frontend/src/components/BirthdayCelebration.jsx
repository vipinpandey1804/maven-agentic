import { motion } from 'framer-motion';

const COLORS = ['#ff5821', '#6366f1', '#10b981', '#f59e0b', '#ec4899', '#0ea5e9', '#8b5cf6'];

// Balloons rise from the bottom-right (near the Ask Maven chat button), staying on the right edge.
function Balloon({ i }) {
  const right = 12 + (i * 29) % 150;   // cluster within ~160px of the right edge
  const color = COLORS[i % COLORS.length];
  const dur = 9 + (i % 5);
  const delay = (i % 6) * 1.1;
  const size = [30, 48, 68][i % 3];
  const drift = -((i % 4) * 22);       // gently drift left as they rise
  return (
    <motion.div className="absolute" style={{ right: `${right}px`, bottom: 70 }}
      initial={{ y: 30, opacity: 0 }}
      animate={{ y: [30, -window.innerHeight - 140], x: [0, drift, drift / 2, drift], opacity: [0, 0.32, 0.32, 0] }}
      transition={{ duration: dur, delay, repeat: Infinity, ease: 'easeInOut' }}>
      <div style={{ width: size, height: size * 1.18, background: color }} className="rounded-[50%] shadow-sm" />
      <div className="mx-auto h-4 w-px bg-black/10" />
    </motion.div>
  );
}

export default function BirthdayCelebration({ name }) {
  return (
    <>
      {/* balloons confined to the bottom-right corner (from the chat button) */}
      <div className="pointer-events-none fixed bottom-0 right-0 top-0 z-0 w-64 overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => <Balloon key={`b${i}`} i={i} />)}
      </div>

      {/* wish banner */}
      <motion.div initial={{ opacity: 0, y: -10, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 240, damping: 18 }}
        className="relative z-10 overflow-hidden rounded-2xl border border-orange-200 bg-gradient-to-r from-orange-50 via-pink-50 to-amber-50 px-5 py-4 text-center shadow-sm">
        <motion.div className="text-xl font-extrabold tracking-tight"
          animate={{ scale: [1, 1.04, 1] }} transition={{ duration: 1.6, repeat: Infinity }}>
          🎉 Happy Birthday, {name}! 🎂
        </motion.div>
        <p className="mt-0.5 text-xs text-muted-foreground">Wishing you a wonderful year ahead from the whole team 🎈</p>
      </motion.div>
    </>
  );
}
