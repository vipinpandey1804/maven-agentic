import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Send, Bot, User, X, AlertCircle, MessageSquarePlus, History, Trash2, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Button, Input, Spinner } from './ui';

const SUGGESTIONS = [
  'How many active employees?',
  'Whose slip failed last month?',
  'Total payout in the last batch?',
];

export default function FloatingAssistant() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(null);
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [showThreads, setShowThreads] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef();

  useEffect(() => {
    if (open && !status) api.ragStatus().then(setStatus).catch(() => setStatus(null));
    if (open) loadThreads();
  }, [open]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy, open]);

  const loadThreads = () => api.chatList().then(setConversations).catch(() => setConversations([]));

  function newChat() {
    setConversationId(null); setMessages([]); setShowThreads(false);
  }

  async function openThread(id) {
    setShowThreads(false); setBusy(true);
    try {
      const conv = await api.chatGet(id);
      setConversationId(id);
      setMessages(conv.messages.map((m) => ({ role: m.role, text: m.text, sources: m.sources })));
    } catch { /* ignore */ } finally { setBusy(false); }
  }

  async function removeThread(id, e) {
    e.stopPropagation();
    await api.chatDelete(id).catch(() => {});
    if (id === conversationId) newChat();
    loadThreads();
  }

  async function ask(q) {
    const question = (q ?? input).trim();
    if (!question || busy) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: question }]);
    setBusy(true);
    try {
      const res = await api.chatAsk(question, conversationId);
      setConversationId(res.conversationId);
      setMessages((m) => [...m, { role: 'assistant', text: res.answer, sources: res.sources }]);
      loadThreads();
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', text: e.message, error: true }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <motion.button
        onClick={() => setOpen((o) => !o)}
        whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-orange-500 text-white shadow-lg shadow-orange-300/50"
        aria-label="Open Ask Maven"
      >
        <AnimatePresence mode="wait" initial={false}>
          {open ? (
            <motion.span key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}><X size={22} /></motion.span>
          ) : (
            <motion.span key="s" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }}><Sparkles size={22} /></motion.span>
          )}
        </AnimatePresence>
        {!open && (
          <span className="absolute right-0 top-0 flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-400" />
          </span>
        )}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="fixed bottom-24 right-6 z-40 flex h-[30rem] w-[23rem] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl"
          >
            <div className="flex items-center gap-2 border-b bg-gradient-to-r from-orange-500 to-amber-500 px-3 py-3 text-white">
              {showThreads ? (
                <button onClick={() => setShowThreads(false)} className="rounded p-1 hover:bg-white/20" title="Back"><ArrowLeft size={16} /></button>
              ) : (
                <button onClick={() => { setShowThreads(true); loadThreads(); }} className="rounded p-1 hover:bg-white/20" title="Chat history"><History size={16} /></button>
              )}
              <Sparkles size={16} />
              <div className="flex-1 leading-tight">
                <div className="text-sm font-semibold">Ask Maven</div>
                <div className="text-[11px] opacity-80">Your Maven assistant</div>
              </div>
              <button onClick={newChat} className="rounded p-1 hover:bg-white/20" title="New chat"><MessageSquarePlus size={16} /></button>
            </div>

            {showThreads ? (
              <div className="flex-1 space-y-1.5 overflow-auto p-3">
                <button onClick={newChat} className="mb-1 flex w-full items-center gap-2 rounded-lg border border-dashed border-orange-300 px-3 py-2 text-sm text-orange-600 transition-colors hover:bg-orange-50">
                  <MessageSquarePlus size={15} /> New chat
                </button>
                {conversations.length === 0 && <p className="py-8 text-center text-xs text-muted-foreground">No past chats yet</p>}
                {conversations.map((c) => (
                  <div key={c.id} onClick={() => openThread(c.id)}
                    className={`group flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-accent ${c.id === conversationId ? 'bg-accent' : ''}`}>
                    <MessageSquarePlus size={14} className="shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{c.title || 'Untitled'}</div>
                      <div className="text-[10px] text-muted-foreground">{c.message_count} messages · {new Date(c.updated_at).toLocaleDateString()}</div>
                    </div>
                    <button onClick={(e) => removeThread(c.id, e)} className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-rose-600 group-hover:opacity-100" title="Delete">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex-1 space-y-3 overflow-auto p-4">
                {status && status.chunks === 0 && (
                  <div className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
                    <AlertCircle size={13} className="mt-px shrink-0" />
                    <span>Knowledge base is empty. Click Reindex in <Link to="/settings" className="font-medium underline">Settings then Knowledge</Link>.</span>
                  </div>
                )}
                {messages.length === 0 && (
                  <div className="flex flex-col items-center gap-3 py-6 text-center">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-100 text-orange-600"><Bot size={22} /></div>
                    <p className="text-xs text-muted-foreground">Hi! I'm Maven. Try asking:</p>
                    <div className="flex flex-col gap-1.5">
                      {SUGGESTIONS.map((s) => (
                        <button key={s} onClick={() => ask(s)} className="rounded-full border bg-card px-3 py-1.5 text-xs transition-colors hover:bg-accent">{s}</button>
                      ))}
                    </div>
                  </div>
                )}
                {messages.map((m, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    className={`flex gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-orange-100 text-orange-600'}`}>
                      {m.role === 'user' ? <User size={14} /> : <Bot size={14} />}
                    </div>
                    <div className="max-w-[78%]">
                      <div className={`whitespace-pre-wrap rounded-xl px-3 py-2 text-xs ${
                        m.role === 'user' ? 'bg-primary text-primary-foreground'
                          : m.error ? 'border border-rose-200 bg-rose-50 text-rose-700' : 'bg-muted'}`}>
                        {m.text}
                      </div>
                    </div>
                  </motion.div>
                ))}
                {busy && (
                  <div className="flex gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-100 text-orange-600"><Bot size={14} /></div>
                    <div className="flex items-center rounded-xl bg-muted px-3 py-2"><Spinner className="h-3.5 w-3.5" /></div>
                  </div>
                )}
                <div ref={endRef} />
              </div>
            )}

            {!showThreads && (
              <form onSubmit={(e) => { e.preventDefault(); ask(); }} className="flex gap-2 border-t p-3">
                <Input className="h-9 text-sm" placeholder="Ask Maven anything…" value={input} onChange={(e) => setInput(e.target.value)} />
                <Button type="submit" size="icon" className="h-9 w-9 shrink-0" disabled={busy || !input.trim()}><Send size={15} /></Button>
              </form>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
