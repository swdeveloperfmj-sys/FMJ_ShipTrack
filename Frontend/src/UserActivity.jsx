import React, { useEffect, useState } from "react";
import { Activity, ArrowRight, RefreshCw } from "lucide-react";
import { api } from "./api.js";

const resources = ["shipments", "consignees", "countries", "currencies", "materials", "pre-costings", "post-costings", "users", "settings", "session", "pages"];
const actions = ["Sign in", "View page", "Create", "Update", "Delete", "Sign out"];
const dateTime = (value) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Colombo" }).format(new Date(value));
const humanize = (value) => value.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("-", " ");
const initialFilters = { actorId: "", resource: "", action: "", outcome: "", from: "", to: "", recordId: "", page: 1 };

export default function UserActivity() {
  const [filters, setFilters] = useState(initialFilters);
  const [data, setData] = useState({ events: [], actors: [], total: 0, page: 1, limit: 50 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [updatedAt, setUpdatedAt] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api.getActivity(filters).then((result) => {
      if (!cancelled) { setData(result); setUpdatedAt(new Date()); }
    }).catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [filters, refresh]);
  useEffect(() => {
    const timer = setInterval(() => { if (!document.hidden) setRefresh((value) => value + 1); }, 30000);
    return () => clearInterval(timer);
  }, []);
  const change = (key, value) => setFilters((current) => ({ ...current, [key]: value, page: 1 }));
  const pages = Math.max(1, Math.ceil(data.total / data.limit));
  return <div className="activity-page">
    <div className="page-title"><div><div className="eyebrow">SUPER ADMINISTRATION</div><h1>User activity</h1><p>Follow user actions and record workflows across the workspace.</p></div><button className="button secondary" onClick={() => setRefresh((value) => value + 1)} disabled={loading}><RefreshCw size={16} />Refresh</button></div>
    <section className="panel activity-overview"><Activity size={24} /><div><strong>Activity process flow</strong><p>Sign in <ArrowRight size={13} /> View pages <ArrowRight size={13} /> Create / update records <ArrowRight size={13} /> Sign out</p><small>New activity is saved from feature activation onward. Times are shown in Sri Lanka time. Refreshes every 30 seconds.</small></div></section>
    <section className="panel activity-filters" aria-label="Activity filters">
      <label>User<select value={filters.actorId} onChange={(event) => change("actorId", event.target.value)}><option value="">All users</option>{data.actors.map((actor) => <option key={actor._id} value={actor._id}>{actor.name} (@{actor.username})</option>)}</select></label>
      <label>Module<select value={filters.resource} onChange={(event) => change("resource", event.target.value)}><option value="">All modules</option>{resources.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}</select></label>
      <label>Action<select value={filters.action} onChange={(event) => change("action", event.target.value)}><option value="">All actions</option>{actions.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Result<select value={filters.outcome} onChange={(event) => change("outcome", event.target.value)}><option value="">All results</option><option>Success</option><option>Failed</option></select></label>
      <label>From<input type="date" value={filters.from} onChange={(event) => change("from", event.target.value)} /></label>
      <label>To<input type="date" value={filters.to} min={filters.from} onChange={(event) => change("to", event.target.value)} /></label>
      <label>Record ID<input value={filters.recordId} onChange={(event) => change("recordId", event.target.value)} placeholder="Filter a record's full history" /></label>
      <button className="button secondary" onClick={() => setFilters(initialFilters)}>Clear filters</button>
    </section>
    <section className="panel activity-history" aria-busy={loading}>
      <div className="table-toolbar"><div className="table-title"><h2>Activity timeline</h2><span className="count-pill">{data.total}</span></div><small>{loading ? "Updating…" : updatedAt ? `Updated ${dateTime(updatedAt)}` : ""}</small></div>
      {error ? <div className="form-error" role="alert">{error}<button className="button secondary" onClick={() => setRefresh((value) => value + 1)}>Try again</button></div> : <>
        {!data.events.length && <div className="activity-empty">{loading ? "Loading activity…" : "No activity matches these filters."}</div>}
        <ol className="activity-timeline">{data.events.map((event) => <li key={event.id}>
          <span className={`activity-dot ${event.outcome === "Failed" ? "failed" : ""}`} />
          <div className="activity-event-head"><strong>{event.actorName} <small>@{event.username} · {event.role === "super-admin" ? "Super admin" : "User"}</small></strong><time dateTime={event.occurredAt}>{dateTime(event.occurredAt)}</time></div>
          <div className="activity-event-action"><b>{event.action}</b><span>{humanize(event.resource)}{event.label ? ` · ${event.label}` : ""}</span><span className={`activity-result ${event.outcome === "Failed" ? "failed" : ""}`}>{event.outcome}{event.outcome === "Failed" ? ` (${event.statusCode})` : ""}</span></div>
          {event.recordId && <button className="activity-record" onClick={() => setFilters((current) => ({ ...current, resource: event.resource, recordId: event.recordId, page: 1 }))}>Record: {event.recordId} · View workflow</button>}
          {!!event.fields?.length && <p className="activity-fields">Submitted fields: {event.fields.map(humanize).join(", ")}</p>}
          {!!Object.keys(event.state || {}).length && <div className="activity-state">{Object.entries(event.state).map(([key, value]) => <span key={key}>{humanize(key)}: <strong>{value}</strong></span>)}</div>}
        </li>)}</ol>
        <div className="activity-pagination"><span>Page {data.page} of {pages} · newest first</span><button className="button secondary" disabled={loading || filters.page <= 1} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}>Previous</button><button className="button secondary" disabled={loading || filters.page >= pages} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}>Next</button></div>
      </>}
    </section>
  </div>;
}
