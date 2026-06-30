import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, AlertCircle, Mail, Brain, CalendarClock, Building2, FileText, Sparkles, Database, RefreshCw, Upload, Trash2, Bot } from 'lucide-react';
import { api } from '../lib/api';
import AgentsPanel from './Agents';
import {
  Button, Card, CardContent, CardHeader, CardTitle, CardDescription,
  Input, Label, Tabs, TabsList, TabsTrigger, TabsContent, Spinner, Empty,
} from '../components/ui';

function useSetting(key) {
  const [value, setValue] = useState(null);
  useEffect(() => { api.getSetting(key).then(setValue).catch(() => setValue({})); }, [key]);
  return [value, setValue];
}

function SaveBar({ onSave, busy, msg }) {
  return (
    <div className="flex items-center gap-3">
      <Button onClick={onSave} disabled={busy}>{busy ? <Spinner className="h-4 w-4 border-white" /> : null} Save changes</Button>
      {msg && (
        <motion.span initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
          className={`flex items-center gap-1.5 text-sm ${msg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>
          {msg.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />} {msg.text}
        </motion.span>
      )}
    </div>
  );
}

const OPENAI_MODELS = ['gpt-5.5', 'gpt-5.5-pro', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-5.2', 'gpt-5.1', 'gpt-5', 'gpt-4o', 'gpt-4o-mini', 'o3'];
const CLAUDE_MODELS = ['claude-fable-5', 'claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5'];

function ModelSelect({ label, models, value, onChange }) {
  const isCustom = value !== '' && !models.includes(value);
  const [custom, setCustom] = useState(isCustom);
  return (
    <div>
      <Label>{label}</Label>
      <select
        value={custom ? '__custom__' : (value || models[0])}
        onChange={(e) => {
          if (e.target.value === '__custom__') { setCustom(true); }
          else { setCustom(false); onChange(e.target.value); }
        }}
        className="flex h-9 w-full rounded-md border bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {models.map((m) => <option key={m} value={m}>{m}</option>)}
        <option value="__custom__">Custom…</option>
      </select>
      {custom && (
        <Input className="mt-2" placeholder="model id e.g. gpt-5.4-mini-2026-01-15"
          value={value} onChange={(e) => onChange(e.target.value)} autoFocus />
      )}
    </div>
  );
}

function Field({ label, hint, ...props }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input {...props} />
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function Settings() {
  const [smtp, setSmtp] = useSetting('smtp');
  const [llm, setLlm] = useSetting('llm');
  const [schedule, setSchedule] = useSetting('schedule');
  const [company, setCompany] = useSetting('company');
  const [templates, setTemplates] = useState(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState({});
  const [aiPrompt, setAiPrompt] = useState('');
  const [rag, setRag] = useState(null);
  const [doc, setDoc] = useState({ title: '', file: null });
  const docFileRef = useRef(null);
  const [activeTpl, setActiveTpl] = useState(0);
  const [newName, setNewName] = useState('');

  useEffect(() => { api.ragStatus().then(setRag).catch(() => setRag(null)); }, []);

  async function reindex() {
    setBusy('reindex'); setMsg((m) => ({ ...m, rag: null }));
    try {
      const r = await api.ragReindex();
      setRag(await api.ragStatus());
      setMsg((m) => ({ ...m, rag: { ok: true, text: `Indexed ${r.documents} docs / ${r.chunks} chunks (${r.model})` } }));
    } catch (e) {
      setMsg((m) => ({ ...m, rag: { ok: false, text: e.message } }));
    } finally { setBusy(''); }
  }

  async function uploadDoc() {
    if (!doc.file) return;
    setBusy('doc'); setMsg((m) => ({ ...m, rag: null }));
    try {
      await api.ragUploadDoc(doc.file, doc.title);
      setDoc({ title: '', file: null });
      if (docFileRef.current) docFileRef.current.value = '';
      setRag(await api.ragStatus());
      setMsg((m) => ({ ...m, rag: { ok: true, text: 'Document uploaded and embedded' } }));
    } catch (e) {
      setMsg((m) => ({ ...m, rag: { ok: false, text: e.message } }));
    } finally { setBusy(''); }
  }

  useEffect(() => { api.templates().then(setTemplates).catch(() => setTemplates([])); }, []);

  async function save(key, value, after) {
    setBusy(key); setMsg((m) => ({ ...m, [key]: null }));
    try {
      const res = await api.putSetting(key, value);
      after?.(res);
      setMsg((m) => ({ ...m, [key]: { ok: true, text: 'Saved' } }));
    } catch (e) {
      setMsg((m) => ({ ...m, [key]: { ok: false, text: e.message } }));
    } finally {
      setBusy('');
    }
  }

  async function testSmtp() {
    setBusy('smtp-test');
    try {
      const res = await api.testSmtp();
      setMsg((m) => ({ ...m, smtp: { ok: res.ok, text: res.dev ? 'Dev mode (jsonTransport) — emails are logged, not sent' : 'SMTP connection OK' } }));
    } catch (e) {
      setMsg((m) => ({ ...m, smtp: { ok: false, text: e.message } }));
    } finally {
      setBusy('');
    }
  }

  async function saveTemplate(t) {
    setBusy('tpl');
    try {
      const meta = t.placeholders_json ? JSON.parse(t.placeholders_json) : {};
      const saved = await api.putTemplate(t.name, { subject: t.subject, body_html: t.body_html, placeholders: meta.placeholders, description: meta.description });
      const list = await api.templates();
      setTemplates(list);
      setActiveTpl(Math.max(0, list.findIndex((x) => x.name === saved.name)));
      setMsg((m) => ({ ...m, tpl: { ok: true, text: 'Template saved' } }));
    } catch (e) {
      setMsg((m) => ({ ...m, tpl: { ok: false, text: e.message } }));
    } finally {
      setBusy('');
    }
  }

  function newTemplate() {
    const raw = (newName || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
    if (!raw) { setMsg((m) => ({ ...m, tpl: { ok: false, text: 'Enter a name for the new template' } })); return; }
    if (templates.some((t) => t.name === raw)) { setMsg((m) => ({ ...m, tpl: { ok: false, text: 'A template with that name already exists' } })); return; }
    const blank = {
      id: `new-${raw}`, name: raw,
      subject: `Subject for ${raw}`,
      body_html: `<div style="font-family:Arial,sans-serif;max-width:560px">\n  <p>Dear {name},</p>\n  <p>Write your ${raw} message here.</p>\n  <p style="color:#64748b;font-size:12px">This is an automated message from {company}.</p>\n</div>`,
      placeholders_json: JSON.stringify({ description: '', placeholders: ['name', 'company'] }),
    };
    const list = [...templates, blank];
    setTemplates(list);
    setActiveTpl(list.length - 1);
    setNewName('');
    setMsg((m) => ({ ...m, tpl: { ok: true, text: 'New template ready - edit and Save to persist' } }));
  }

  async function removeTemplate(t) {
    if (t.name === 'salary-slip') return;
    setBusy('tpl-del');
    try {
      if (!String(t.id).startsWith('new-')) await api.deleteTemplate(t.name);
      const list = await api.templates();
      setTemplates(list);
      setActiveTpl(0);
      setMsg((m) => ({ ...m, tpl: { ok: true, text: 'Template deleted' } }));
    } catch (e) {
      setMsg((m) => ({ ...m, tpl: { ok: false, text: e.message } }));
    } finally { setBusy(''); }
  }

  async function aiDraft(idx) {
    setBusy('ai'); setMsg((m) => ({ ...m, ai: null }));
    try {
      const draft = await api.aiCompose(aiPrompt, 'professional');
      setTemplates((ts) => ts.map((x, i) => (i === idx ? { ...x, subject: draft.subject, body_html: draft.body_html } : x)));
      setMsg((m) => ({ ...m, ai: { ok: true, text: 'Draft generated — review and Save' } }));
    } catch (e) {
      setMsg((m) => ({ ...m, ai: { ok: false, text: e.message } }));
    } finally {
      setBusy('');
    }
  }

  if (!smtp || !llm || !schedule || !company || !templates) {
    return <div className="flex justify-center py-24"><Spinner className="h-8 w-8" /></div>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">SMTP, LLM provider, schedule, company branding and email templates</p>
      </div>

      <Tabs defaultValue="smtp">
        <TabsList>
          <TabsTrigger value="smtp"><Mail size={14} className="mr-1.5 inline" />SMTP</TabsTrigger>
          <TabsTrigger value="llm"><Brain size={14} className="mr-1.5 inline" />LLM</TabsTrigger>
          <TabsTrigger value="schedule"><CalendarClock size={14} className="mr-1.5 inline" />Schedule</TabsTrigger>
          <TabsTrigger value="company"><Building2 size={14} className="mr-1.5 inline" />Company</TabsTrigger>
          <TabsTrigger value="templates"><FileText size={14} className="mr-1.5 inline" />Templates</TabsTrigger>
          <TabsTrigger value="knowledge"><Database size={14} className="mr-1.5 inline" />Knowledge</TabsTrigger>
          <TabsTrigger value="agents"><Bot size={14} className="mr-1.5 inline" />Agents</TabsTrigger>
        </TabsList>

        <div className="mt-5">
          <TabsContent value="smtp">
            <Card className="max-w-2xl">
              <CardHeader>
                <CardTitle>Email (SMTP)</CardTitle>
                <CardDescription>
                  Gmail/Workspace: use an App Password (Google Account → Security → 2-Step Verification → App passwords).
                  Until configured, the platform runs in dev mode and logs emails instead of sending.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Host" value={smtp.host || ''} onChange={(e) => setSmtp({ ...smtp, host: e.target.value })} />
                  <Field label="Port" type="number" value={smtp.port || 465} onChange={(e) => setSmtp({ ...smtp, port: Number(e.target.value) })} />
                  <Field label="User (email)" value={smtp.user || ''} onChange={(e) => setSmtp({ ...smtp, user: e.target.value })} />
                  <Field label="App password" type="password" value={smtp.pass || ''} onChange={(e) => setSmtp({ ...smtp, pass: e.target.value })} />
                  <Field label="From name" value={smtp.fromName || ''} onChange={(e) => setSmtp({ ...smtp, fromName: e.target.value })} />
                  <Field label="From email" value={smtp.fromEmail || ''} onChange={(e) => setSmtp({ ...smtp, fromEmail: e.target.value })} />
                </div>
                <div className="flex items-center gap-3">
                  <SaveBar busy={busy === 'smtp'} msg={msg.smtp}
                    onSave={() => save('smtp', { ...smtp, transport: smtp.user ? 'smtp' : 'json' }, setSmtp)} />
                  <Button variant="outline" disabled={busy === 'smtp-test'} onClick={testSmtp}>
                    {busy === 'smtp-test' ? <Spinner className="h-4 w-4" /> : null} Test connection
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="llm">
            <Card className="max-w-2xl">
              <CardHeader>
                <CardTitle>LLM provider</CardTitle>
                <CardDescription>Used by agents for composing email content and (Phase 2) the RAG assistant.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Provider</Label>
                  <select
                    value={llm.provider || 'anthropic'}
                    onChange={(e) => setLlm({ ...llm, provider: e.target.value })}
                    className="flex h-9 w-full rounded-md border bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="anthropic">Anthropic (Claude)</option>
                    <option value="openai">OpenAI</option>
                  </select>
                </div>
                <motion.div
                  key={llm.provider || 'anthropic'}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className="grid gap-4 sm:grid-cols-2"
                >
                  {(llm.provider || 'anthropic') === 'anthropic' ? (
                    <>
                      <Field label="Claude API key" type="password" placeholder="sk-ant-…"
                        value={llm.apiKey || ''} onChange={(e) => setLlm({ ...llm, apiKey: e.target.value })} />
                      <ModelSelect label="Claude model" models={CLAUDE_MODELS}
                        value={llm.model || ''} onChange={(v) => setLlm({ ...llm, model: v })} />
                    </>
                  ) : (
                    <>
                      <Field label="OpenAI API key" type="password" placeholder="sk-…"
                        value={llm.openaiApiKey || ''} onChange={(e) => setLlm({ ...llm, openaiApiKey: e.target.value })} />
                      <ModelSelect label="OpenAI model" models={OPENAI_MODELS}
                        value={llm.openaiModel || ''} onChange={(v) => setLlm({ ...llm, openaiModel: v })} />
                    </>
                  )}
                </motion.div>
                <SaveBar busy={busy === 'llm'} msg={msg.llm} onSave={() => save('llm', llm, setLlm)} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="schedule">
            <Card className="max-w-2xl">
              <CardHeader>
                <CardTitle>Dispatch schedule</CardTitle>
                <CardDescription>When the salary-slip agent fires. Default: 09:00 IST on the 1st of every month.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Cron expression" hint='e.g. "0 9 1 * *" = 09:00 on day 1'
                    value={schedule.cron || ''} onChange={(e) => setSchedule({ ...schedule, cron: e.target.value })} />
                  <Field label="Timezone" hint='e.g. "Asia/Kolkata"'
                    value={schedule.timezone || ''} onChange={(e) => setSchedule({ ...schedule, timezone: e.target.value })} />
                </div>
                <SaveBar busy={busy === 'schedule'} msg={msg.schedule} onSave={() => save('schedule', schedule, setSchedule)} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="company">
            <Card className="max-w-2xl">
              <CardHeader>
                <CardTitle>Company</CardTitle>
                <CardDescription>Shown on the salary slip PDF header.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Field label="Company name" value={company.name || ''} onChange={(e) => setCompany({ ...company, name: e.target.value })} />
                <Field label="Address" value={company.address || ''} onChange={(e) => setCompany({ ...company, address: e.target.value })} />
                <SaveBar busy={busy === 'company'} msg={msg.company} onSave={() => save('company', company, setCompany)} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="templates">
            {(() => {
              const sample = {
                name: 'Asha Verma', month: 'June', year: new Date().getFullYear(),
                company: company.name || 'Your Company Pvt. Ltd.', net_pay: '70,000',
                designation: 'Senior Engineer', department: 'Engineering', years: '1', date_of_joining: '2025-06-01',
              };
              const fill = (s) => String(s || '').replace(/\{(\w+)\}/g, (_, k) => (sample[k] !== undefined ? sample[k] : `{${k}}`));
              const t = templates[activeTpl];
              const idx = activeTpl;
              const meta = t && t.placeholders_json ? (() => { try { return JSON.parse(t.placeholders_json); } catch { return {}; } })() : {};
              const phList = (meta.placeholders && meta.placeholders.length) ? meta.placeholders : ['name', 'company'];
              return (
                <div className="space-y-4">
                  {/* template selector */}
                  <div className="flex flex-wrap items-center gap-2">
                    {templates.map((x, i) => (
                      <button key={x.id} onClick={() => setActiveTpl(i)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${i === activeTpl ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent'}`}>
                        {x.name}
                      </button>
                    ))}
                    <div className="ml-auto flex items-center gap-2">
                      <Input className="h-8 w-40 text-xs" placeholder="new-template-name" value={newName} onChange={(e) => setNewName(e.target.value)} />
                      <Button size="sm" variant="outline" onClick={newTemplate}><FileText size={14} /> New</Button>
                    </div>
                  </div>

                  {!t ? <Card><CardContent><Empty>No templates</Empty></CardContent></Card> : (
                    <Card>
                      <CardHeader className="flex-row items-center justify-between">
                        <div>
                          <CardTitle className="font-mono text-sm">{t.name}</CardTitle>
                          <CardDescription>{meta.description ? meta.description + ' · ' : ''}Placeholders: {phList.map((p) => `{${p}}`).join(' ')}</CardDescription>
                        </div>
                        {t.name !== 'salary-slip' && (
                          <Button variant="destructive" size="sm" disabled={busy === 'tpl-del'} onClick={() => removeTemplate(t)}>
                            {busy === 'tpl-del' ? <Spinner className="h-4 w-4 border-white" /> : <Trash2 size={14} />} Delete
                          </Button>
                        )}
                      </CardHeader>
                      <CardContent>
                        <div className="mb-5 rounded-lg border border-violet-200 bg-violet-50/60 p-3">
                          <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-violet-700"><Sparkles size={15} /> AI compose</div>
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <Input placeholder='Describe the email, e.g. "warm welcome tone for a new joinee"' value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} />
                            <Button variant="secondary" disabled={busy === 'ai'} onClick={() => aiDraft(idx)} className="shrink-0">
                              {busy === 'ai' ? <Spinner className="h-4 w-4" /> : <Sparkles size={15} />} Generate draft
                            </Button>
                          </div>
                          {msg.ai && (
                            <p className={`mt-2 flex items-center gap-1.5 text-xs ${msg.ai.ok ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {msg.ai.ok ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />} {msg.ai.text}
                            </p>
                          )}
                        </div>
                        <div className="grid gap-6 lg:grid-cols-2">
                          <div className="space-y-4">
                            <Field label="Subject" value={t.subject}
                              onChange={(e) => setTemplates(templates.map((x, i) => (i === idx ? { ...x, subject: e.target.value } : x)))} />
                            <div>
                              <Label>Body (HTML)</Label>
                              <textarea value={t.body_html} rows={14}
                                onChange={(e) => setTemplates(templates.map((x, i) => (i === idx ? { ...x, body_html: e.target.value } : x)))}
                                className="w-full rounded-md border bg-card p-3 font-mono text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                            </div>
                            <SaveBar busy={busy === 'tpl'} msg={msg.tpl} onSave={() => saveTemplate(t)} />
                          </div>

                          <div>
                            <Label>Live preview</Label>
                            <div className="overflow-hidden rounded-lg border shadow-sm">
                              <div className="space-y-1 border-b bg-muted/60 px-4 py-3 text-xs">
                                <div className="flex gap-2"><span className="w-12 shrink-0 text-muted-foreground">From</span><span className="font-medium">{(smtp.fromName || 'HR Department')} &lt;{smtp.fromEmail || smtp.user || 'hr@company.com'}&gt;</span></div>
                                <div className="flex gap-2"><span className="w-12 shrink-0 text-muted-foreground">To</span><span>{sample.name} &lt;asha@example.com&gt;</span></div>
                                <div className="flex gap-2"><span className="w-12 shrink-0 text-muted-foreground">Subject</span><span className="font-semibold">{fill(t.subject)}</span></div>
                              </div>
                              <div className="max-h-96 overflow-auto bg-white p-4 text-sm" dangerouslySetInnerHTML={{ __html: fill(t.body_html) }} />
                              {t.name === 'salary-slip' && (
                                <div className="flex items-center gap-2 border-t bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
                                  <FileText size={13} />
                                  <span className="font-medium">SalarySlip-{sample.month}-{sample.year}.pdf</span>
                                  <span className="rounded-full border bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">password-protected</span>
                                </div>
                              )}
                            </div>
                            <p className="mt-1.5 text-xs text-muted-foreground">Rendered with sample data — updates as you type. Save to apply.</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              );
            })()}
          </TabsContent>

          <TabsContent value="knowledge">
            <Card className="max-w-2xl">
              <CardHeader>
                <CardTitle>Knowledge base (RAG)</CardTitle>
                <CardDescription>
                  Embeds your employees, salary records, batches and company info so the assistant can answer
                  questions over your data. Add policy documents for company-wide Q&A.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    ['Documents', rag?.documents ?? '—'],
                    ['Chunks', rag?.chunks ?? '—'],
                    ['Store', rag?.store ?? '—'],
                    ['Embedding', rag?.embedding?.model ?? '—'],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-lg border bg-muted/40 p-3">
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</div>
                      <div className="truncate text-sm font-semibold" title={String(v)}>{v}</div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-3">
                  <Button onClick={reindex} disabled={busy === 'reindex'}>
                    {busy === 'reindex' ? <Spinner className="h-4 w-4 border-white" /> : <RefreshCw size={15} />} Reindex now
                  </Button>
                  {msg.rag && (
                    <span className={`flex items-center gap-1.5 text-sm ${msg.rag.ok ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {msg.rag.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />} {msg.rag.text}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Tip: re-run after importing employees or approving a salary batch so the assistant sees the latest data.
                  {rag?.embedding?.backend === 'local' && ' Currently using the local embedding fallback — add an OpenAI key in the LLM tab for higher-quality semantic search.'}
                </p>

                <div className="border-t pt-4">
                  <div className="mb-2 text-sm font-medium">Add a document (policy, handbook, FAQ)</div>
                  <p className="mb-2 text-xs text-muted-foreground">Upload a PDF or Word (.docx) file. Text is extracted and embedded automatically.</p>
                  <div className="space-y-2">
                    <Input placeholder="Title (optional, defaults to file name)" value={doc.title}
                      onChange={(e) => setDoc({ ...doc, title: e.target.value })} />
                    <Input ref={docFileRef} type="file" accept=".pdf,.doc,.docx"
                      onChange={(e) => setDoc({ ...doc, file: e.target.files?.[0] || null })} />
                    <Button variant="secondary" onClick={uploadDoc} disabled={busy === 'doc' || !doc.file}>
                      {busy === 'doc' ? <Spinner className="h-4 w-4" /> : <Upload size={15} />} Upload &amp; embed
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="agents">
            <AgentsPanel />
          </TabsContent>

        </div>
      </Tabs>
    </div>
  );
}
