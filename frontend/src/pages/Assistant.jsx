import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Send, Bot, User, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Button, Card, CardContent, Input, Spinner } from '../components/ui';

const SUGGESTIONS = [
  'How many active employees are there?',
  'Whose salary slip failed last month?',
  'What was the total payout in the last batch?',
  'Which department has the most employees?',
];

export default function Assistant() {
  const [status, setStatus] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef();

  useEffect(() => { api.aiStatus().then(setStatus).catch(() => setStatus({ configured: false })); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);

  async function ask(q) {
    const question = (q ?? input).trim();
    if (!question || busy) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: question }]);
    setBusy(true);
    try {
      const res = await api.aiAssistant(question);
      setMessages((m) => [...m, { role: 'assistant', text: res.answer, usedLlm: res.usedLlm }]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', text: e.message, error: true }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-3.5rem)] max-w-3xl flex-col">
      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Sparkles size={22} className="text-violet-500" /> Assistant
        </h1>
        <p className="text-sm text-muted-foreground">Ask about employees, batches, payouts and failed sends — answered from your data.</p>
      </div>

      {status && !status.configured && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertCircle size={15} />
          No LLM key set — answers come back as plain data summaries. Add a key in{' '}
          <Link to="/settings" className="font-medium underline">Settings → LLM</Link> for natural-language replies.
        </div>
      )}

      <Card className="flex flex-1 flex-col overflow-hidden">
        <CardContent className="flex-1 space-y-4 overflow-auto p-5">
          {messages.length === 0 && (
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
                <Bot size={24} />
              </div>
              <p className="text-sm text-muted-foreground">Try one of these:</p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => ask(s)}
                    className="rounded-full border bg-card px-3 py-1.5 text-xs transition-colors hover:bg-accent">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          <AnimatePresence initial={false}>
            {messages.map((m, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-violet-100 text-violet-600'}`}>
                  {m.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                </div>
                <div className={`max-w-[80%] whitespace-pre-wrap rounded-xl px-4 py-2.5 text-sm ${
                  m.role === 'user' ? 'bg-primary text-primary-foreground'
                    : m.error ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-muted'}`}>
                  {m.text}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {busy && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-600"><Bot size={16} /></div>
              <div className="flex items-center rounded-xl bg-muted px-4 py-3"><Spinner className="h-4 w-4" /></div>
            </div>
          )}
          <div ref={endRef} />
        </CardContent>
        <div className="border-t p-3">
          <form onSubmit={(e) => { e.preventDefault(); ask(); }} className="flex gap-2">
            <Input placeholder="Ask a question about your payroll data…" value={input}
              onChange={(e) => setInput(e.target.value)} />
            <Button type="submit" disabled={busy || !input.trim()}><Send size={15} /></Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
