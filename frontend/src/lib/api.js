const BASE = (import.meta.env.VITE_API_URL || '') + '/api';

export function getToken() { return sessionStorage.getItem('token'); }
export function setToken(t) { t ? sessionStorage.setItem('token', t) : sessionStorage.removeItem('token'); }
export function setUser(u) { u ? sessionStorage.setItem('user', JSON.stringify(u)) : sessionStorage.removeItem('user'); }
export function getUser() { try { return JSON.parse(sessionStorage.getItem('user') || 'null'); } catch { return null; } }
export function getRole() { return getUser()?.role || null; }

async function call(path, { method = 'GET', body, formData } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, { method, headers, body: formData || (body ? JSON.stringify(body) : undefined) });
  if (res.status === 401 && !path.startsWith('/auth')) { setToken(null); window.location.href = '/login'; throw new Error('Session expired'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const err = new Error(data.error || `Request failed (${res.status})`); err.details = data.details; throw err; }
  return data;
}

export const api = {
  login: (email, password) => call('/auth/login', { method: 'POST', body: { email, password } }),
  me: () => call('/auth/me'),
  changePassword: (currentPassword, newPassword) => call('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } }),
  dashboard: () => call('/dashboard'),
  employees: (q = '') => call(`/employees${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  importEmployees: (file) => { const fd = new FormData(); fd.append('file', file); return call('/employees/import', { method: 'POST', formData: fd }); },
  employeeHistory: (id) => call(`/employees/${id}/history`),
  employeeOverview: (id) => call(`/employees/${id}/overview`),
  updateEmployee: (id, body) => call(`/employees/${id}`, { method: 'PUT', body }),
  sendEmployeeEmail: (id, template) => call(`/employees/${id}/send-email`, { method: 'POST', body: { template } }),
  meDashboard: () => call('/me/dashboard'),
  meProfile: () => call('/me/profile'),
  mePayslips: () => call('/me/payslips'),
  // authenticated file (PDF) download helper
  downloadFile: async (path, filename) => {
    const res = await fetch(BASE + path, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!res.ok) { let m = 'Download failed'; try { m = (await res.json()).error || m; } catch { /* ignore */ } throw new Error(m); }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename || 'salary-slip.pdf'; a.click();
    URL.revokeObjectURL(a.href);
  },
  downloadMySlip: (recordId, filename) => api.downloadFile(`/me/payslips/${recordId}/slip`, filename),
  downloadSlip: (recordId, filename) => api.downloadFile(`/salary/records/${recordId}/slip`, filename),
  myLeaves: () => call('/me/leaves'),
  applyLeave: (body) => call('/me/leaves', { method: 'POST', body }),
  leaves: (status) => call(`/leaves${status ? `?status=${status}` : ''}`),
  reviewLeave: (id, status, note) => call(`/leaves/${id}/review`, { method: 'POST', body: { status, note } }),
  // change-request tickets
  myTickets: () => call('/me/tickets'),
  createTicket: (body) => call('/me/tickets', { method: 'POST', body }),
  myTicket: (id) => call(`/me/tickets/${id}`),
  commentMyTicket: (id, message) => call(`/me/tickets/${id}/comments`, { method: 'POST', body: { message } }),
  tickets: (status) => call(`/tickets${status ? `?status=${status}` : ''}`),
  ticket: (id) => call(`/tickets/${id}`),
  commentTicket: (id, message) => call(`/tickets/${id}/comments`, { method: 'POST', body: { message } }),
  setTicketStatus: (id, status, note) => call(`/tickets/${id}/status`, { method: 'POST', body: { status, note } }),
  users: () => call('/users'),
  createUser: (body) => call('/users', { method: 'POST', body }),
  updateUser: (id, body) => call(`/users/${id}`, { method: 'PUT', body }),
  deleteUser: (id) => call(`/users/${id}`, { method: 'DELETE' }),
  backfillEmployeeAccounts: () => call('/users/backfill-employees', { method: 'POST' }),
  // notifications
  notifications: () => call('/notifications'),
  notifUnread: () => call('/notifications/unread-count'),
  notifRead: (id) => call(`/notifications/${id}/read`, { method: 'POST' }),
  notifReadAll: () => call('/notifications/read-all', { method: 'POST' }),
  batches: () => call('/salary/batches'),
  batch: (id) => call(`/salary/batches/${id}`),
  uploadSalary: (file, month, year) => { const fd = new FormData(); fd.append('file', file); fd.append('month', month); fd.append('year', year); return call('/salary/upload', { method: 'POST', formData: fd }); },
  approveBatch: (id) => call(`/salary/batches/${id}/approve`, { method: 'POST' }),
  rejectBatch: (id, reason) => call(`/salary/batches/${id}/reject`, { method: 'POST', body: { reason } }),
  sendBatch: (id) => call(`/salary/batches/${id}/send`, { method: 'POST' }),
  flagRecord: (id, body) => call(`/salary/records/${id}/flag`, { method: 'PUT', body }),
  getSetting: (key) => call(`/settings/${key}`),
  putSetting: (key, value) => call(`/settings/${key}`, { method: 'PUT', body: value }),
  testSmtp: () => call('/settings/smtp/test', { method: 'POST' }),
  templates: () => call('/templates'),
  putTemplate: (name, body) => call(`/templates/${name}`, { method: 'PUT', body }),
  deleteTemplate: (name) => call(`/templates/${name}`, { method: 'DELETE' }),
  agents: () => call('/agents'),
  putAgent: (name, body) => call(`/agents/${name}`, { method: 'PUT', body }),
  runAgent: (name) => call(`/agents/${name}/run`, { method: 'POST' }),
  sendLogs: () => call('/logs/sends'),
  auditLogs: () => call('/logs/audit'),
  aiStatus: () => call('/ai/status'),
  aiCompose: (instruction, tone) => call('/ai/compose-template', { method: 'POST', body: { instruction, tone } }),
  aiAssistant: (question) => call('/ai/assistant', { method: 'POST', body: { question } }),
  ragStatus: () => call('/rag/status'),
  ragReindex: () => call('/rag/reindex', { method: 'POST' }),
  ragAsk: (question, history) => call('/rag/ask', { method: 'POST', body: { question, history } }),
  ragAddDoc: (title, content) => call('/rag/documents', { method: 'POST', body: { title, content } }),
  ragUploadDoc: (file, title) => { const fd = new FormData(); fd.append('file', file); if (title) fd.append('title', title); return call('/rag/documents/upload', { method: 'POST', formData: fd }); },
  chatList: () => call('/chat/conversations'),
  chatGet: (id) => call(`/chat/conversations/${id}`),
  chatDelete: (id) => call(`/chat/conversations/${id}`, { method: 'DELETE' }),
  chatAsk: (question, conversationId) => call('/chat/ask', { method: 'POST', body: { question, conversationId } }),
};
