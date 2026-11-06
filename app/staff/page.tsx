"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

type Staff = { id: string; name: string; email: string; role: string; roleName: string; permissions: string[] };
type Envelope<T> = { success: boolean; data?: T; error?: { code?: string; message?: string } };
type Dashboard = Record<string, number | string | null>;
type Lead = Record<string, unknown> & { lead_id: string; first_name?: string; last_name?: string; lead_status: string; priority_score?: number; assigned_staff_id?: string | null };
type Task = Record<string, unknown> & { task_id: string; title: string; status: string; priority: string; due_at?: string | null };
type Notice = Record<string, unknown> & { notification_id: string; event_type: string; title: string; message: string; is_read: boolean; created_at: string };
type WaitItem = Record<string, unknown> & { request_id: string; match_status: string; preferred_location?: string | null; leads?: { first_name?: string; last_name?: string } };
type TeamMember = { staff_id: string; display_name: string; is_active: boolean; staff_roles?: { role_code?: string; display_name?: string } | Array<{ role_code?: string; display_name?: string }> };
type PropertyMedia = { media_id: string; media_type: string; media_url: string; display_order?: number; is_primary?: boolean };

const api = async <T,>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, { ...init, headers: { ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers } });
  const result = await response.json() as Envelope<T>;
  if (!response.ok || !result.success) throw new Error(result.error?.message ?? "The request could not be completed.");
  return result.data as T;
};

const navItems = [
  ["overview", "Overview"], ["leads", "Leads"], ["tasks", "Tasks"],
  ["waitlist", "Property waitlist"], ["notifications", "Notifications"],
  ["properties", "Properties"], ["records", "Agency records"],
] as const;
type Section = typeof navItems[number][0] | "assistant";

function displayDate(value: unknown) {
  if (typeof value !== "string" || !value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}
function display(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function StaffPage() {
  const [staff, setStaff] = useState<Staff | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [busy, setBusy] = useState(false);
  const [section, setSection] = useState<Section>("overview");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [waitlist, setWaitlist] = useState<WaitItem[]>([]);
  const [records, setRecords] = useState<Record<string, unknown>[]>([]);
  const [resource, setResource] = useState("transactions");
  const [properties, setProperties] = useState<Record<string, unknown>[]>([]);
  const [assistantHistory, setAssistantHistory] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [assistantSession, setAssistantSession] = useState("");
  const [pendingConfirmations, setPendingConfirmations] = useState<Array<Record<string, unknown>>>([]);
  const [assistantInput, setAssistantInput] = useState("");
  const [flash, setFlash] = useState("");
  const [error, setError] = useState("");
  const [leadFilter, setLeadFilter] = useState("all");
  const isAdmin = staff?.role === "administrator";

  const loadStaff = useCallback(async () => {
    try {
      const data = await api<Staff>("/api/staff/me");
      setStaff(data);
    } catch {
      setStaff(null);
    } finally {
      setAuthChecked(true);
    }
  }, []);

  const loadSection = useCallback(async (target: Section) => {
    if (!staff) return;
    setError("");
    try {
      if (target === "overview") {
        setDashboard(await api<Dashboard>("/api/staff/dashboard"));
        const [taskData, noticeData] = await Promise.all([
          api<{ items: Task[] }>("/api/tasks?pageSize=6&status=open"),
          api<{ items: Notice[] }>("/api/notifications?pageSize=5&is_read=false"),
        ]);
        setTasks(taskData.items ?? []);
        setNotices(noticeData.items ?? []);
      } else if (target === "leads") {
        const query = leadFilter === "all" ? "" : `&lead_status=${encodeURIComponent(leadFilter)}`;
        const data = await api<{ items: Lead[] }>(`/api/leads?pageSize=50&sort=created_at&order=desc${query}`);
        setLeads(data.items ?? []);
        if (isAdmin) setTeam(await api<TeamMember[]>("/api/staff"));
      } else if (target === "tasks") {
        const data = await api<{ items: Task[] }>("/api/tasks?pageSize=100");
        setTasks(data.items ?? []);
      } else if (target === "waitlist") {
        const data = await api<{ items: WaitItem[] }>("/api/staff/waitlist?pageSize=50");
        setWaitlist(data.items ?? []);
      } else if (target === "notifications") {
        const data = await api<{ items: Notice[] }>("/api/notifications?pageSize=100");
        setNotices(data.items ?? []);
      } else if (target === "properties") {
        const data = await api<Record<string, unknown>[]>("/api/properties");
        setProperties(data ?? []);
      } else if (target === "records") {
        const endpoint = resource === "audit" ? "/api/staff/audit?pageSize=100" : `/api/${resource}`;
        const data = await api<unknown>(endpoint);
        setRecords(Array.isArray(data) ? data as Record<string, unknown>[] :
          data && typeof data === "object" && "items" in data && Array.isArray((data as { items: unknown }).items)
            ? (data as { items: Record<string, unknown>[] }).items : []);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load this workspace.");
    }
  }, [staff, leadFilter, resource, isAdmin]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadStaff(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadStaff]);
  useEffect(() => {
    if (!staff) return;
    const timer = window.setTimeout(() => { void loadSection(section); }, 0);
    return () => window.clearTimeout(timer);
  }, [staff, section, loadSection]);

  async function login(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setLoginError("");
    try {
      await api<{ staff: Staff }>("/api/staff/session", { method: "POST", body: JSON.stringify({ email, password }) });
      setPassword("");
      await loadStaff();
    } catch (cause) {
      setLoginError(cause instanceof Error ? cause.message : "Sign in failed.");
    } finally { setBusy(false); }
  }

  async function logout() {
    await fetch("/api/staff/session", { method: "DELETE" });
    window.sessionStorage.removeItem("taurine-staff-assistant-session");
    setStaff(null);
    setSection("overview");
    setAssistantSession("");
    setAssistantHistory([]);
    setPendingConfirmations([]);
  }

  async function updateTask(task: Task, status: string) {
    try {
      await api(`/api/tasks/${task.task_id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      setFlash("Task status updated.");
      await loadSection(section);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Task update failed."); }
  }

  async function markRead(notice: Notice) {
    try {
      await api(`/api/notifications/${notice.notification_id}`, { method: "PATCH", body: JSON.stringify({ is_read: true }) });
      setNotices((current) => current.map((item) => item.notification_id === notice.notification_id ? { ...item, is_read: true } : item));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Notification update failed."); }
  }

  async function updateLeadStatus(lead: Lead, lead_status: string) {
    try {
      await api(`/api/leads/${lead.lead_id}`, { method: "PATCH", body: JSON.stringify({ lead_status }) });
      setFlash("Lead status updated.");
      await loadSection("leads");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Lead update failed."); }
  }

  async function assignLead(lead: Lead, staff_id: string) {
    if (!staff_id) return;
    try {
      await api("/api/staff/leads/assign", { method: "POST", body: JSON.stringify({ lead_id: lead.lead_id, staff_id, reason: "dashboard assignment" }) });
      setFlash("Lead assigned and the staff member notified.");
      await loadSection("leads");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Lead assignment failed."); }
  }

  async function sendAssistant(event: FormEvent) {
    event.preventDefault();
    if (!assistantInput.trim() || busy) return;
    const userMessage = assistantInput.trim();
    setAssistantInput("");
    setAssistantHistory((history) => [...history, { role: "user", content: userMessage }]);
    setBusy(true);
    setError("");
    try {
      const result = await api<{ message: string; session_id: string; pending_confirmations: Array<Record<string, unknown>> }>("/api/staff/assistant", {
        method: "POST",
        body: JSON.stringify({ message: userMessage, ...(assistantSession ? { session_id: assistantSession } : {}) }),
      });
      setAssistantSession(result.session_id);
      setPendingConfirmations(result.pending_confirmations ?? []);
      setAssistantHistory((history) => [...history, { role: "assistant", content: result.message }]);
      setFlash(result.pending_confirmations?.length ? "An action proposal is waiting for your review below." : "");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Assistant is unavailable."); }
    finally { setBusy(false); }
  }

  async function confirmAction(id: string) {
    setBusy(true);
    try {
      await api(`/api/staff/actions/${id}/confirm`, { method: "POST", body: "{}" });
      setPendingConfirmations((current) => current.filter((item) => item.confirmation_id !== id));
      setFlash("Confirmed action completed.");
      setAssistantHistory((history) => [...history, { role: "assistant", content: "The confirmed action completed successfully." }]);
      await loadSection(section);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The action could not be confirmed."); }
    finally { setBusy(false); }
  }

  if (!authChecked) return <main className="staff-loading"><span className="spinner" /> Checking your staff session…</main>;

  if (!staff) return <main className="login-shell">
    <Link className="brand" href="/"><span className="brand-mark">T</span><span>TAURINE<small>REAL ESTATE</small></span></Link>
    <section className="login-card"><span className="eyebrow">TEAM ACCESS</span><h1>Welcome<br /><em>back.</em></h1><p>Sign in to your Taurine workspace.</p>
      <form onSubmit={login}><label htmlFor="staff-email">Work email</label><input id="staff-email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /><label htmlFor="staff-password">Password</label><input id="staff-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
        {loginError && <p className="form-error" role="alert">{loginError}</p>}<button className="button button-dark login-submit" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in securely"} <span aria-hidden="true">↗</span></button></form>
      <Link className="text-link login-back" href="/">← Back to Taurine</Link>
    </section>
    <p className="login-footnote">Access is managed by your agency administrator.</p>
  </main>;

  const displayItems = navItems.filter(([id]) => id !== "records" || isAdmin);
  const visibleItems = displayItems.filter(([id]) => {
    if (id === "leads") return isAdmin || staff.permissions.includes("leads:read") || staff.permissions.includes("leads:assigned:read");
    if (id === "tasks") return isAdmin || staff.permissions.includes("tasks:read") || staff.permissions.includes("tasks:assigned:read");
    if (id === "waitlist") return isAdmin || staff.permissions.includes("leads:read");
    if (id === "records") return isAdmin;
    return true;
  });
  return <main className="workspace-shell">
    <aside className="workspace-sidebar">
      <Link className="brand brand-light" href="/"><span className="brand-mark">T</span><span>TAURINE<small>WORKSPACE</small></span></Link>
      <div className="workspace-user"><span className="avatar">{staff.name.slice(0, 1).toUpperCase()}</span><div><strong>{staff.name}</strong><small>{staff.roleName}</small></div></div>
      <nav aria-label="Workspace navigation">{visibleItems.map(([id, label]) => <button key={id} className={section === id ? "selected" : ""} onClick={() => setSection(id)}><span className="nav-dot" />{label}{id === "notifications" && notices.some((item) => !item.is_read) && <i className="nav-count">{notices.filter((item) => !item.is_read).length}</i>}</button>)}{(isAdmin || staff.permissions.includes("assistant:staff")) && <button className={section === "assistant" ? "selected" : ""} onClick={() => setSection("assistant")}><span className="nav-spark">✳</span>Staff assistant</button>}</nav>
      <div className="sidebar-bottom"><Link href="/">← Public website</Link><button onClick={() => void logout()}>Sign out ↗</button></div>
    </aside>
    <section className="workspace-main">
      <header className="workspace-topbar"><span className="eyebrow">{staff.roleName.toUpperCase()} WORKSPACE</span><div><span className="live-dot" /> Session active <button className="mobile-logout" onClick={() => void logout()}>Sign out</button></div></header>
      <div className="workspace-content">
        <div className="workspace-title"><div><span className="eyebrow">TAURINE / {section.replace("-", " ").toUpperCase()}</span><h1>{section === "overview" ? `Good ${new Date().getHours() < 12 ? "morning" : "afternoon"}, ${staff.name.split(" ")[0]}.` : section === "assistant" ? "Your operations partner." : navItems.find(([key]) => key === section)?.[1] ?? "Workspace"}</h1></div>
          {section === "assistant" ? <span className="assistant-label"><span className="nav-spark">✳</span> AI ASSISTANT</span> : <button className="button button-dark button-small" onClick={() => void loadSection(section)}>Refresh data ↻</button>}</div>
        {flash && <div className="flash-message" role="status">{flash}<button onClick={() => setFlash("")} aria-label="Dismiss">×</button></div>}
        {error && <div className="workspace-error" role="alert">{error}<button onClick={() => { setError(""); void loadSection(section); }}>Retry</button></div>}
        {section === "overview" && <Overview dashboard={dashboard} tasks={tasks} notices={notices} onOpen={setSection} />}
        {section === "leads" && <LeadsPanel leads={leads} team={team} filter={leadFilter} onFilter={setLeadFilter} onRefresh={() => void loadSection("leads")} admin={Boolean(isAdmin)} canCreate={Boolean(isAdmin || staff.permissions.includes("leads:create"))} onStatus={updateLeadStatus} onAssign={assignLead} />}
        {section === "tasks" && <TasksPanel tasks={tasks} canUpdate={Boolean(isAdmin || staff.permissions.includes("tasks:assigned:update") || staff.permissions.includes("tasks:manage"))} canCreate={Boolean(isAdmin || staff.permissions.includes("tasks:create"))} onStatus={updateTask} onCreated={() => void loadSection("tasks")} />}
        {section === "notifications" && <NotificationsPanel notices={notices} onRead={markRead} />}
        {section === "waitlist" && <WaitlistPanel items={waitlist} />}
        {section === "properties" && <PropertiesPanel properties={properties} admin={Boolean(isAdmin)} onRefresh={() => void loadSection("properties")} onMessage={setFlash} />}
        {section === "records" && isAdmin && <RecordsPanel records={records} resource={resource} onResource={setResource} />}
        {section === "assistant" && <AssistantPanel history={assistantHistory} pending={pendingConfirmations} input={assistantInput} onInput={setAssistantInput} onSend={sendAssistant} busy={busy} onConfirm={confirmAction} />}
      </div>
    </section>
  </main>;
}

function Overview({ dashboard, tasks, notices, onOpen }: { dashboard: Dashboard | null; tasks: Task[]; notices: Notice[]; onOpen: (section: Section) => void }) {
  const stats = dashboard ? flattenMetrics(dashboard).slice(0, 6) : [];
  return <div className="overview-layout"><div className="metric-grid">{stats.length ? stats.map(([key, value]) => <article className="metric-card" key={key}><span>{key.replaceAll("_", " ")}</span><strong>{Number(value).toLocaleString()}</strong><small>Live database total</small></article>) : <article className="metric-card metric-empty"><span>AGENCY SNAPSHOT</span><strong>—</strong><small>{dashboard ? "No numeric metrics returned." : "Loading current agency totals…"}</small></article>}</div>
    <div className="workspace-columns"><section className="panel"><div className="panel-heading"><div><span className="eyebrow">KEEP MOVING</span><h2>Open tasks</h2></div><button className="text-link button-plain" onClick={() => onOpen("tasks")}>View all ↗</button></div>
      {tasks.length ? tasks.slice(0, 5).map((task) => <div className="compact-row" key={task.task_id}><span className={`priority-dot ${task.priority}`} /><div><strong>{task.title}</strong><small>{task.due_at ? `Due ${displayDate(task.due_at)}` : "No due date"}</small></div><span className="status-tag">{task.status}</span></div>) : <p className="muted-empty">No open tasks are assigned to you.</p>}</section>
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow">RECENT ACTIVITY</span><h2>Notifications</h2></div><button className="text-link button-plain" onClick={() => onOpen("notifications")}>View all ↗</button></div>
        {notices.length ? notices.slice(0, 5).map((item) => <div className="compact-row" key={item.notification_id}><span className="activity-icon">✳</span><div><strong>{item.title}</strong><small>{item.message}</small></div></div>) : <p className="muted-empty">You’re all caught up.</p>}</section></div>
    <section className="assistant-promo"><span className="nav-spark">✳</span><div><span className="eyebrow">YOUR TAURINE ASSISTANT</span><h2>One question can make<br />the next step clearer.</h2><p>Get live operational summaries and prepare tasks or property updates for your review.</p></div><button className="button button-light" onClick={() => onOpen("assistant")}>Open assistant ↗</button></section>
  </div>;
}

function flattenMetrics(value: Record<string, unknown>, prefix = ""): Array<[string, number]> {
  return Object.entries(value).flatMap(([key, child]) => {
    const label = prefix ? `${prefix} ${key}` : key;
    if (typeof child === "number") return [[label, child] as [string, number]];
    if (child && typeof child === "object" && !Array.isArray(child)) {
      return flattenMetrics(child as Record<string, unknown>, label);
    }
    return [];
  });
}

function LeadsPanel({ leads, team, filter, onFilter, onRefresh, admin, canCreate, onStatus, onAssign }: { leads: Lead[]; team: TeamMember[]; filter: string; onFilter: (filter: string) => void; onRefresh: () => void; admin: boolean; canCreate: boolean; onStatus: (lead: Lead, status: string) => void; onAssign: (lead: Lead, staffId: string) => void }) {
  return <section className="panel table-panel"><div className="panel-heading"><div><span className="eyebrow">CUSTOMER RELATIONSHIP MANAGEMENT</span><h2>Lead inbox</h2></div><select aria-label="Filter leads by status" value={filter} onChange={(event) => { onFilter(event.target.value); onRefresh(); }}><option value="all">All statuses</option>{["new", "contacted", "qualified", "converted", "closed"].map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
    {canCreate && <LeadEntryForm onCreated={onRefresh} />}
    {!leads.length ? <div className="muted-empty">No leads are available in your permitted scope.</div> : <div className="table-scroll"><table><thead><tr><th>CONTACT</th><th>INTENT</th><th>STATUS</th><th>PRIORITY</th><th>CREATED</th><th>ASSIGNMENT</th></tr></thead><tbody>{leads.map((lead) => <tr key={lead.lead_id}><td><strong>{[lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Prospective client"}</strong><small>{display(lead.email || lead.phone_number)}</small></td><td>{display(lead.lead_type)}<small>{display(lead.preferred_location)}</small></td><td>{admin ? <select aria-label={`Update ${[lead.first_name, lead.last_name].filter(Boolean).join(" ") || "lead"} status`} value={lead.lead_status} onChange={(event) => onStatus(lead, event.target.value)}>{["new", "contacted", "qualified", "converted", "closed"].map((item) => <option key={item} value={item}>{item}</option>)}</select> : <span className="status-tag">{lead.lead_status}</span>}</td><td><span className={`priority-label ${Number(lead.priority_score) >= 70 ? "urgent" : ""}`}>{display(lead.priority_score)}</span></td><td>{displayDate(lead.created_at)}</td><td>{admin ? <select aria-label="Assign lead to staff member" value={lead.assigned_staff_id ?? ""} onChange={(event) => onAssign(lead, event.target.value)}><option value="">Unassigned</option>{team.filter((member) => member.is_active).map((member) => { const role = Array.isArray(member.staff_roles) ? member.staff_roles[0] : member.staff_roles; return <option key={member.staff_id} value={member.staff_id}>{member.display_name} · {role?.display_name ?? role?.role_code ?? "Staff"}</option>; })}</select> : "Assigned to you"}</td></tr>)}</tbody></table></div>}
  </section>;
}

function LeadEntryForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", phone_number: "", lead_type: "buyer", consent_to_contact: false });
  async function submit(event: FormEvent) {
    event.preventDefault(); if (saving) return;
    setSaving(true); setError("");
    try {
      await api("/api/leads", { method: "POST", body: JSON.stringify({
        ...form,
        email: form.email || undefined,
        phone_number: form.phone_number || undefined,
      }) });
      setForm({ first_name: "", last_name: "", email: "", phone_number: "", lead_type: "buyer", consent_to_contact: false });
      setOpen(false); onCreated();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Lead could not be saved."); }
    finally { setSaving(false); }
  }
  return <div className="lead-entry"><button className="text-link button-plain" onClick={() => setOpen(!open)}>{open ? "Close lead form ×" : "Register a lead +"}</button>{open && <form className="lead-entry-form" onSubmit={submit}>
    <label>First name<input value={form.first_name} onChange={(event) => setForm({ ...form, first_name: event.target.value })} maxLength={100} /></label>
    <label>Last name<input value={form.last_name} onChange={(event) => setForm({ ...form, last_name: event.target.value })} maxLength={100} /></label>
    <label>Email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} maxLength={255} /></label>
    <label>Phone<input type="tel" value={form.phone_number} onChange={(event) => setForm({ ...form, phone_number: event.target.value })} maxLength={30} /></label>
    <label>Enquiry type<select value={form.lead_type} onChange={(event) => setForm({ ...form, lead_type: event.target.value })}>{["buyer", "seller", "tenant", "landlord", "other"].map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
    <label className="lead-consent"><input type="checkbox" checked={form.consent_to_contact} onChange={(event) => setForm({ ...form, consent_to_contact: event.target.checked })} /> Contact consent is recorded</label>
    {error && <p className="form-error">{error}</p>}<button className="button button-dark button-small" disabled={saving || !form.consent_to_contact || (!form.email && !form.phone_number)}>{saving ? "Saving…" : "Save lead"} ↗</button>
  </form>}</div>;
}

function TasksPanel({ tasks, canUpdate, canCreate, onStatus, onCreated }: { tasks: Task[]; canUpdate: boolean; canCreate: boolean; onStatus: (task: Task, status: string) => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [taskError, setTaskError] = useState("");
  const [saving, setSaving] = useState(false);
  async function createTask(event: FormEvent) {
    event.preventDefault(); if (!title.trim() || saving) return;
    setSaving(true); setTaskError("");
    try { await api("/api/tasks", { method: "POST", body: JSON.stringify({ title: title.trim(), priority: "normal" }) }); setTitle(""); onCreated(); }
    catch (cause) { setTaskError(cause instanceof Error ? cause.message : "Task creation failed."); }
    finally { setSaving(false); }
  }
  return <div className="workspace-columns task-workspace"><section className="panel"><div className="panel-heading"><div><span className="eyebrow">FOLLOW-UPS AND OPERATIONS</span><h2>Your task list</h2></div></div>
    {tasks.map((task) => <div className="task-row" key={task.task_id}><span className={`priority-dot ${task.priority}`} /><div className="task-description"><strong>{task.title}</strong><p>{display(task.description)}</p><small>{task.due_at ? `Due ${displayDate(task.due_at)}` : "No due date"} · {task.priority}</small></div>{canUpdate ? <select aria-label={`Update ${task.title} status`} value={task.status} onChange={(event) => onStatus(task, event.target.value)}><option value="open">Open</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select> : <span className="status-tag">{task.status}</span>}</div>)}
    {!tasks.length && <p className="muted-empty">No tasks in your permitted scope.</p>}
  </section>{canCreate && <section className="panel create-task-panel"><span className="eyebrow">QUICK ACTION</span><h2>Create a follow-up</h2><p>Create a task assigned to you. Admins and lead coordinators may assign tasks through the supported API.</p><form onSubmit={createTask}><label htmlFor="new-task-title">Task title</label><input id="new-task-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} required placeholder="e.g. Call about viewing availability" />{taskError && <p role="alert" className="form-error">{taskError}</p>}<button className="button button-dark" disabled={saving}>{saving ? "Creating…" : "Create task"} ↗</button></form></section>}</div>;
}

function NotificationsPanel({ notices, onRead }: { notices: Notice[]; onRead: (notice: Notice) => void }) {
  return <section className="panel"><div className="panel-heading"><div><span className="eyebrow">AGENCY ACTIVITY</span><h2>Your notifications</h2></div><span className="status-tag">{notices.filter((item) => !item.is_read).length} unread</span></div>
    {notices.map((notice) => <article className={`notification-row ${notice.is_read ? "read" : ""}`} key={notice.notification_id}><span className="activity-icon">✳</span><div><strong>{notice.title}</strong><p>{notice.message}</p><small>{notice.event_type} · {displayDate(notice.created_at)}</small></div>{!notice.is_read && <button className="text-link button-plain" onClick={() => onRead(notice)}>Mark read</button>}</article>)}
    {!notices.length && <p className="muted-empty">No notifications are currently available.</p>}
  </section>;
}

function WaitlistPanel({ items }: { items: WaitItem[] }) {
  return <section className="panel table-panel"><div className="panel-heading"><div><span className="eyebrow">DEMAND AND PROPERTY MATCHES</span><h2>Property waitlist</h2></div></div>
    {!items.length ? <p className="muted-empty">No waitlist requests are currently available.</p> : <div className="waitlist-grid">{items.map((item) => <article className="wait-card" key={item.request_id}><div><span className="status-tag">{item.match_status}</span><span className="eyebrow">REQUEST {item.request_id.slice(0, 8)}</span></div><h3>{[item.leads?.first_name, item.leads?.last_name].filter(Boolean).join(" ") || "Prospective client"}</h3><p>{item.preferred_location || "Flexible location"}{item.budget_min || item.budget_max ? ` · ${display(item.budget_min)}–${display(item.budget_max)}` : ""}</p><p className="wait-card-matches">{Array.isArray(item.property_matches) ? `${item.property_matches.length} matched listing(s)` : "No attached matches"}</p></article>)}</div>}
  </section>;
}

function PropertiesPanel({ properties, admin, onRefresh, onMessage }: { properties: Record<string, unknown>[]; admin: boolean; onRefresh: () => void; onMessage: (message: string) => void }) {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ property_type: "", location: "", listing_price: "", square_footage: "", listing_status: "active" });
  async function createProperty(event: FormEvent) {
    event.preventDefault(); if (!admin || saving) return;
    setSaving(true); setError("");
    try {
      await api("/api/properties", { method: "POST", body: JSON.stringify({ ...form, listing_price: Number(form.listing_price), square_footage: Number(form.square_footage) }) });
      onMessage("Property created."); setShowForm(false); onRefresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Property could not be created."); }
    finally { setSaving(false); }
  }
  return <div className="panel table-panel"><div className="panel-heading"><div><span className="eyebrow">LIVE PROPERTY INVENTORY</span><h2>Property catalogue</h2></div>{admin && <button className="button button-dark button-small" onClick={() => setShowForm(!showForm)}>{showForm ? "Cancel" : "Add property +"} </button>}</div>
    {!admin && <p className="permission-note">You can browse live listings. Editing is reserved for authorized administrators or assigned property managers.</p>}
    {showForm && <form className="property-create-form" onSubmit={createProperty}><label>Property type<input required value={form.property_type} onChange={(e) => setForm({ ...form, property_type: e.target.value })} /></label><label>Location<input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></label><label>Price<input type="number" min="0" required value={form.listing_price} onChange={(e) => setForm({ ...form, listing_price: e.target.value })} /></label><label>Square footage<input type="number" min="0" required value={form.square_footage} onChange={(e) => setForm({ ...form, square_footage: e.target.value })} /></label><label>Status<select value={form.listing_status} onChange={(e) => setForm({ ...form, listing_status: e.target.value })}><option value="active">Active</option><option value="pending">Pending</option><option value="sold">Sold</option><option value="leased">Leased</option></select></label>{error && <p className="form-error">{error}</p>}<button className="button button-dark" disabled={saving}>{saving ? "Saving…" : "Create property"} ↗</button></form>}
    <div className="table-scroll"><table><thead><tr><th>PROPERTY</th><th>LOCATION</th><th>PRICE</th><th>STATUS</th><th>DETAILS</th>{admin && <th>MANAGE</th>}</tr></thead><tbody>{properties.map((item) => <PropertyRow key={display(item.property_id)} item={item} admin={admin} onRefresh={onRefresh} onMessage={onMessage} />)}</tbody></table></div>
    {!properties.length && <p className="muted-empty">No properties are present in the database.</p>}
  </div>;
}

function PropertyRow({ item, admin, onRefresh, onMessage }: { item: Record<string, unknown>; admin: boolean; onRefresh: () => void; onMessage: (message: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showMedia, setShowMedia] = useState(false);
  const [media, setMedia] = useState<PropertyMedia[]>([]);
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaType, setMediaType] = useState("image");
  const [draft, setDraft] = useState({
    property_type: String(item.property_type ?? ""),
    location: String(item.location ?? ""),
    listing_price: String(item.listing_price ?? ""),
    square_footage: String(item.square_footage ?? ""),
    listing_status: String(item.listing_status ?? "active"),
  });
  async function save() {
    if (saving) return;
    setSaving(true); setError("");
    try {
      await api(`/api/properties/${String(item.property_id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          property_type: draft.property_type,
          location: draft.location || null,
          listing_price: Number(draft.listing_price),
          square_footage: Number(draft.square_footage),
          listing_status: draft.listing_status,
        }),
      });
      setEditing(false); onMessage("Property updated."); onRefresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Property update failed."); }
    finally { setSaving(false); }
  }
  async function remove() {
    if (!window.confirm("Permanently delete this property and its dependent records? This cannot be undone.")) return;
    setSaving(true); setError("");
    try {
      await api(`/api/properties/${String(item.property_id)}`, { method: "DELETE" });
      onMessage("Property deleted."); onRefresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Property could not be deleted."); }
    finally { setSaving(false); }
  }
  async function toggleMedia() {
    if (!showMedia) {
      setSaving(true); setError("");
      try {
        const items = await api<PropertyMedia[]>(`/api/properties/${String(item.property_id)}/media`);
        setMedia(items);
        setShowMedia(true);
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Property media could not be loaded."); }
      finally { setSaving(false); }
    } else setShowMedia(false);
  }
  async function addMedia(event: FormEvent) {
    event.preventDefault(); if (saving || !mediaUrl.trim()) return;
    setSaving(true); setError("");
    try {
      const created = await api<PropertyMedia>(`/api/properties/${String(item.property_id)}/media`, {
        method: "POST",
        body: JSON.stringify({ media_type: mediaType, media_url: mediaUrl.trim(), display_order: media.length, is_primary: media.length === 0 }),
      });
      setMedia((current) => [...current, created]);
      setMediaUrl("");
      onMessage("Property media link added.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Media link could not be saved."); }
    finally { setSaving(false); }
  }
  async function removeMedia(mediaId: string) {
    setSaving(true); setError("");
    try {
      await api(`/api/properties/${String(item.property_id)}/media/${mediaId}`, { method: "DELETE" });
      setMedia((current) => current.filter((entry) => entry.media_id !== mediaId));
      onMessage("Media link removed.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Media link could not be removed."); }
    finally { setSaving(false); }
  }
  return <>
    <tr><td><strong>{display(item.property_type)}</strong>{editing && <input aria-label="Property type" value={draft.property_type} onChange={(event) => setDraft({ ...draft, property_type: event.target.value })} />}</td>
      <td>{editing ? <input aria-label="Property location" value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} /> : display(item.location)}</td>
      <td>{editing ? <input aria-label="Property listing price" type="number" min="0" value={draft.listing_price} onChange={(event) => setDraft({ ...draft, listing_price: event.target.value })} /> : typeof item.listing_price === "number" ? `$${item.listing_price.toLocaleString()}` : display(item.listing_price)}</td>
      <td>{editing ? <><select aria-label="Property listing status" value={draft.listing_status} onChange={(event) => setDraft({ ...draft, listing_status: event.target.value })}>{["active", "pending", "sold", "leased", "inactive"].map((status) => <option key={status} value={status}>{status}</option>)}</select><input aria-label="Square footage" type="number" min="0" value={draft.square_footage} onChange={(event) => setDraft({ ...draft, square_footage: event.target.value })} /></> : <span className="status-tag">{display(item.listing_status)}</span>}</td>
      <td><Link className="text-link" href={`/property/${display(item.property_id)}`}>Open ↗</Link></td>
      {admin && <td className="manage-actions">{editing ? <><button className="text-link button-plain" onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save"}</button><button className="text-link button-plain" onClick={() => setEditing(false)}>Cancel</button></> : <><button className="text-link button-plain" onClick={() => setEditing(true)}>Edit</button><button className="text-link button-plain" onClick={() => void toggleMedia()} disabled={saving}>Media</button><button className="text-link button-plain danger-link" onClick={() => void remove()} disabled={saving}>Delete</button></>}</td>}
    </tr>
    {error && <tr><td colSpan={admin ? 6 : 5}><p className="form-error">{error}</p></td></tr>}
    {showMedia && <tr><td colSpan={6}><div className="media-manager"><span className="eyebrow">PROPERTY MEDIA LINKS</span>{media.map((entry) => <div className="media-manager-row" key={entry.media_id}><span>{entry.media_type}{entry.is_primary ? " · Primary" : ""}</span><a href={entry.media_url} target="_blank" rel="noreferrer">{entry.media_url}</a><button className="text-link button-plain danger-link" onClick={() => void removeMedia(entry.media_id)} disabled={saving}>Remove</button></div>)}{!media.length && <p className="permission-note">No media links are attached.</p>}<form className="media-manager-form" onSubmit={addMedia}><select aria-label="Media type" value={mediaType} onChange={(event) => setMediaType(event.target.value)}><option value="image">Image</option><option value="video">Video</option><option value="virtual_tour">Virtual tour</option></select><input type="url" required maxLength={2000} placeholder="https://…" value={mediaUrl} onChange={(event) => setMediaUrl(event.target.value)} aria-label="Media URL" /><button className="button button-dark button-small" disabled={saving}>{saving ? "Saving…" : "Add media link"}</button></form></div></td></tr>}
  </>;
}
function RecordsPanel({ records, resource, onResource }: { records: Record<string, unknown>[]; resource: string; onResource: (resource: string) => void }) {
  const resources = ["clients", "transactions", "leases", "financing", "tax-assessments", "agents", "staff", "audit"];
  const fields = records.length ? Object.keys(records[0]).slice(0, 6) : [];
  return <section className="panel table-panel"><div className="panel-heading"><div><span className="eyebrow">ADMINISTRATIVE RECORDS</span><h2>{resource.replaceAll("-", " ")}</h2></div><select aria-label="Choose record type" value={resource} onChange={(event) => onResource(event.target.value)}>{resources.map((item) => <option key={item} value={item}>{item.replaceAll("-", " ")}</option>)}</select></div>
    {resource === "audit" ? <p className="permission-note">Use the dedicated audit workspace endpoint; audit data is read-only.</p> : null}
    {!records.length ? <p className="muted-empty">No records are available, or this resource requires additional role permissions.</p> : <div className="table-scroll"><table><thead><tr>{fields.map((field) => <th key={field}>{field.replaceAll("_", " ")}</th>)}</tr></thead><tbody>{records.map((record, index) => <tr key={String(record.id ?? record.property_id ?? record.client_id ?? record.lead_id ?? index)}>{fields.map((field) => <td key={field}>{display(record[field])}</td>)}</tr>)}</tbody></table></div>}
    <p className="permission-note">This read-only table uses the existing agency API. Manage operations are available only when a supported, authorized backend route exists.</p>
  </section>;
}

function AssistantPanel({ history, pending, input, onInput, onSend, busy, onConfirm }: { history: Array<{ role: "user" | "assistant"; content: string }>; pending: Array<Record<string, unknown>>; input: string; onInput: (value: string) => void; onSend: (event: FormEvent) => void; busy: boolean; onConfirm: (id: string) => void }) {
  return <div className="assistant-workspace"><section className="assistant-intro"><span className="nav-spark">✳</span><div><span className="eyebrow">LIVE, ROLE-AWARE OPERATIONS</span><h2>Ask. Understand.<br /><em>Decide with confidence.</em></h2><p>Ask for live dashboard summaries, lead searches, or propose a task or property change. Changes require confirmation and are applied only after you approve them.</p></div></section>
    <div className="assistant-chat-panel"><div className="assistant-chat-history" aria-live="polite">{!history.length && <p className="muted-empty">Try “Summarize today’s agency dashboard” or “Create a follow-up task to call a buyer tomorrow.”</p>}{history.map((item, index) => <div key={index} className={`assistant-message ${item.role}`}><span>{item.role === "user" ? "YOU" : "TAURINE ASSISTANT"}</span><p>{item.content}</p></div>)}</div>
      {!!pending.length && <div className="confirmation-card"><span className="eyebrow">ACTION NEEDS YOUR APPROVAL</span><p>Review the exact proposed changes and target before confirming. Nothing is applied until you choose Confirm.</p>{pending.map((item) => <article className="confirmation-item" key={String(item.confirmation_id)}><strong>{String(item.action_type).replace(".", " ")}</strong>{typeof item.entity_id === "string" && <small>Target record: {item.entity_id}</small>}<pre>{JSON.stringify(item.proposed_changes, null, 2)}</pre><small>Expires {displayDate(item.expires_at)}</small><button className="button button-dark button-small" onClick={() => onConfirm(String(item.confirmation_id))} disabled={busy}>Confirm this action ↗</button></article>)}</div>}
      <form className="assistant-compose" onSubmit={onSend}><label className="sr-only" htmlFor="staff-assistant-prompt">Ask the assistant</label><textarea id="staff-assistant-prompt" rows={2} value={input} onChange={(event) => onInput(event.target.value)} placeholder="Ask about your operations or propose an action…" maxLength={3000} disabled={busy} /><button className="button button-dark" disabled={busy || !input.trim()}>{busy ? "Working…" : "Send"} ↑</button></form>
      <p className="permission-note">The assistant can only access records and actions permitted for your current staff role. It cannot confirm proposals on your behalf.</p>
    </div>
  </div>;
}
