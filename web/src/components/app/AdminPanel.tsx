"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  adminCosts,
  adminDeleteMedia,
  adminFunnel,
  adminGrantHours,
  adminListJobs,
  adminListMedia,
  adminListUsers,
  adminRetryJob,
  type AdminCosts,
  type AdminFunnel,
  type AdminJob,
  type AdminMedia,
  type AdminUser,
} from "@/lib/api";

export type AdminCopy = {
  tabUsers: string;
  tabRecordings: string;
  tabJobs: string;
  tabCosts: string;
  tabFunnel: string;
  funnelUsers: string;
  funnelStep: string;
  funnelPctSignups: string;
  funnelPctPrev: string;
  funnelCohort: string;
  funnelActive: string;
  funnelSources: string;
  funnelSource: string;
  funnelDays7: string;
  funnelDays30: string;
  funnelStepSignedUp: string;
  funnelStepUploaded: string;
  funnelStepReady: string;
  funnelStepFailed: string;
  funnelStepMinutes: string;
  funnelStepExport: string;
  funnelStepRegen: string;
  email: string;
  role: string;
  balance: string;
  grant: string;
  grantHours: string;
  filename: string;
  owner: string;
  status: string;
  error: string;
  delete: string;
  kind: string;
  attempts: string;
  retry: string;
  filterFailed: string;
  filterAll: string;
  periodDay: string;
  periodMonth: string;
  llm: string;
  gpu: string;
  api: string;
  total: string;
  empty: string;
  loading: string;
  actionError: string;
};

type Tab = "users" | "media" | "jobs" | "costs" | "funnel";

type Props = {
  copy: AdminCopy;
};

function formatHours(seconds: number): string {
  const h = seconds / 3600;
  if (h >= 10) return `${Math.round(h)} h`;
  return `${h.toFixed(1)} h`;
}

function funnelStepLabel(copy: AdminCopy, name: string): string {
  switch (name) {
    case "signed_up":
      return copy.funnelStepSignedUp;
    case "uploaded":
      return copy.funnelStepUploaded;
    case "processing_ready":
      return copy.funnelStepReady;
    case "processing_failed":
      return copy.funnelStepFailed;
    case "minutes_viewed":
      return copy.funnelStepMinutes;
    case "export_downloaded":
      return copy.funnelStepExport;
    case "regenerated":
      return copy.funnelStepRegen;
    default:
      return name;
  }
}

export function AdminPanel({ copy }: Props) {
  const [tab, setTab] = useState<Tab>("users");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [media, setMedia] = useState<AdminMedia[]>([]);
  const [jobs, setJobs] = useState<AdminJob[]>([]);
  const [costs, setCosts] = useState<AdminCosts | null>(null);
  const [funnel, setFunnel] = useState<AdminFunnel | null>(null);
  const [failedOnly, setFailedOnly] = useState(true);
  const [costPeriod, setCostPeriod] = useState<"day" | "month">("day");
  const [funnelDays, setFunnelDays] = useState<7 | 30>(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [grantHours, setGrantHours] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === "users") {
        const res = await adminListUsers();
        setUsers(res.items);
      } else if (tab === "media") {
        const res = await adminListMedia(failedOnly ? "failed" : undefined);
        setMedia(res.items);
      } else if (tab === "jobs") {
        const res = await adminListJobs(failedOnly ? "failed" : undefined);
        setJobs(res.items);
      } else if (tab === "funnel") {
        setFunnel(await adminFunnel(funnelDays));
      } else {
        setCosts(await adminCosts(costPeriod));
      }
    } catch (err) {
      setError(err instanceof ApiError ? copy.actionError : copy.actionError);
    } finally {
      setLoading(false);
    }
  }, [tab, failedOnly, costPeriod, funnelDays, copy.actionError]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(t);
  }, [load]);

  async function onGrant(userId: string) {
    const raw = grantHours[userId] ?? "1";
    const hours = Number.parseFloat(raw);
    if (!(hours > 0)) return;
    setBusyId(userId);
    setError(null);
    try {
      const updated = await adminGrantHours(userId, hours);
      setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)));
      setGrantHours((prev) => ({ ...prev, [userId]: "" }));
    } catch {
      setError(copy.actionError);
    } finally {
      setBusyId(null);
    }
  }

  async function onRetry(jobId: string) {
    setBusyId(jobId);
    setError(null);
    try {
      await adminRetryJob(jobId);
      await load();
    } catch {
      setError(copy.actionError);
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(mediaId: string) {
    setBusyId(mediaId);
    setError(null);
    try {
      await adminDeleteMedia(mediaId);
      setMedia((prev) => prev.filter((m) => m.id !== mediaId));
    } catch {
      setError(copy.actionError);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="admin-panel" data-admin="panel">
      <div className="dy-tabs" role="tablist" aria-label="Admin sections">
        {(
          [
            ["users", copy.tabUsers],
            ["media", copy.tabRecordings],
            ["jobs", copy.tabJobs],
            ["funnel", copy.tabFunnel],
            ["costs", copy.tabCosts],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            className="dy-tab"
            aria-selected={tab === id}
            data-admin={`tab-${id}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {(tab === "media" || tab === "jobs") && (
        <div className="admin-panel__filters">
          <button
            type="button"
            className={`dy-btn dy-btn--sm ${failedOnly ? "dy-btn--primary" : "dy-btn--ghost"}`}
            data-admin="filter-failed"
            onClick={() => setFailedOnly(true)}
          >
            {copy.filterFailed}
          </button>
          <button
            type="button"
            className={`dy-btn dy-btn--sm ${!failedOnly ? "dy-btn--primary" : "dy-btn--ghost"}`}
            data-admin="filter-all"
            onClick={() => setFailedOnly(false)}
          >
            {copy.filterAll}
          </button>
        </div>
      )}

      {tab === "funnel" && (
        <div className="admin-seg" role="tablist" aria-label={copy.tabFunnel}>
          <button
            type="button"
            role="tab"
            className="admin-seg__btn"
            aria-selected={funnelDays === 7}
            data-admin="funnel-7"
            onClick={() => setFunnelDays(7)}
          >
            {copy.funnelDays7}
          </button>
          <button
            type="button"
            role="tab"
            className="admin-seg__btn"
            aria-selected={funnelDays === 30}
            data-admin="funnel-30"
            onClick={() => setFunnelDays(30)}
          >
            {copy.funnelDays30}
          </button>
        </div>
      )}

      {tab === "costs" && (
        <div className="admin-panel__filters">
          <button
            type="button"
            className={`dy-btn dy-btn--sm ${costPeriod === "day" ? "dy-btn--primary" : "dy-btn--ghost"}`}
            data-admin="period-day"
            onClick={() => setCostPeriod("day")}
          >
            {copy.periodDay}
          </button>
          <button
            type="button"
            className={`dy-btn dy-btn--sm ${costPeriod === "month" ? "dy-btn--primary" : "dy-btn--ghost"}`}
            data-admin="period-month"
            onClick={() => setCostPeriod("month")}
          >
            {copy.periodMonth}
          </button>
        </div>
      )}

      {error ? (
        <p className="admin-panel__error" data-admin="error" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="dy-muted" data-admin="loading">
          {copy.loading}
        </p>
      ) : null}

      {!loading && tab === "users" && (
        <div className="admin-table-wrap">
          {users.length === 0 ? (
            <p className="dy-muted">{copy.empty}</p>
          ) : (
            <table className="admin-table" data-admin="users">
              <thead>
                <tr>
                  <th>{copy.email}</th>
                  <th>{copy.role}</th>
                  <th>{copy.balance}</th>
                  <th>{copy.grant}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="admin-table__primary">{u.email}</div>
                      {u.name ? (
                        <div className="dy-muted admin-table__sub">{u.name}</div>
                      ) : null}
                    </td>
                    <td>{u.role}</td>
                    <td className="dy-time">{formatHours(u.balance_seconds)}</td>
                    <td>
                      <div className="admin-grant">
                        <input
                          className="dy-input admin-grant__input"
                          type="number"
                          min={0.1}
                          step={0.5}
                          placeholder={copy.grantHours}
                          aria-label={copy.grantHours}
                          value={grantHours[u.id] ?? ""}
                          onChange={(e) =>
                            setGrantHours((prev) => ({
                              ...prev,
                              [u.id]: e.target.value,
                            }))
                          }
                        />
                        <button
                          type="button"
                          className="dy-btn dy-btn--sm dy-btn--secondary"
                          data-admin={`grant-${u.id}`}
                          disabled={busyId === u.id}
                          onClick={() => void onGrant(u.id)}
                        >
                          {copy.grant}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {!loading && tab === "media" && (
        <div className="admin-table-wrap">
          {media.length === 0 ? (
            <p className="dy-muted">{copy.empty}</p>
          ) : (
            <table className="admin-table" data-admin="media">
              <thead>
                <tr>
                  <th>{copy.filename}</th>
                  <th>{copy.owner}</th>
                  <th>{copy.status}</th>
                  <th>{copy.error}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {media.map((m) => (
                  <tr key={m.id}>
                    <td className="admin-table__primary">{m.filename}</td>
                    <td>{m.owner_email}</td>
                    <td>{m.status}</td>
                    <td className="dy-muted">{m.error ?? "—"}</td>
                    <td>
                      <button
                        type="button"
                        className="dy-btn dy-btn--sm dy-btn--danger"
                        data-admin={`delete-${m.id}`}
                        disabled={busyId === m.id}
                        onClick={() => void onDelete(m.id)}
                      >
                        {copy.delete}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {!loading && tab === "jobs" && (
        <div className="admin-table-wrap">
          {jobs.length === 0 ? (
            <p className="dy-muted">{copy.empty}</p>
          ) : (
            <table className="admin-table" data-admin="jobs">
              <thead>
                <tr>
                  <th>{copy.kind}</th>
                  <th>{copy.status}</th>
                  <th>{copy.attempts}</th>
                  <th>{copy.error}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <td className="admin-table__primary">{j.kind}</td>
                    <td>{j.status}</td>
                    <td className="dy-time">{j.attempts}</td>
                    <td className="dy-muted">{j.last_error ?? "—"}</td>
                    <td>
                      {j.status === "failed" ? (
                        <button
                          type="button"
                          className="dy-btn dy-btn--sm dy-btn--secondary"
                          data-admin={`retry-${j.id}`}
                          disabled={busyId === j.id}
                          onClick={() => void onRetry(j.id)}
                        >
                          {copy.retry}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {!loading && tab === "funnel" && funnel && (
        <div className="admin-funnel" data-admin="funnel">
          <dl className="admin-funnel__meta" data-admin="funnel-meta">
            <div>
              <dt>{copy.funnelCohort}</dt>
              <dd className="dy-time">{funnel.cohort}</dd>
            </div>
            <div>
              <dt>{copy.funnelActive}</dt>
              <dd className="dy-time">{funnel.active_users}</dd>
            </div>
          </dl>
          <div className="admin-table-wrap">
            <table className="admin-table" data-admin="funnel-steps">
              <thead>
                <tr>
                  <th>{copy.funnelStep}</th>
                  <th>{copy.funnelUsers}</th>
                  <th>{copy.funnelPctSignups}</th>
                  <th>{copy.funnelPctPrev}</th>
                </tr>
              </thead>
              <tbody>
                {funnel.steps.map((s) => (
                  <tr key={s.name}>
                    <td className="admin-table__primary">
                      {funnelStepLabel(copy, s.name)}
                    </td>
                    <td className="dy-time">{s.users}</td>
                    <td className="dy-time">{s.pct_signups.toFixed(1)}%</td>
                    <td className="dy-time">{s.pct_prev.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 className="admin-funnel__h">{copy.funnelSources}</h3>
          {funnel.sources.length === 0 ? (
            <p className="dy-muted">{copy.empty}</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table" data-admin="funnel-sources">
                <thead>
                  <tr>
                    <th>{copy.funnelSource}</th>
                    <th>{copy.funnelUsers}</th>
                  </tr>
                </thead>
                <tbody>
                  {funnel.sources.map((s) => (
                    <tr key={s.source}>
                      <td className="admin-table__primary">{s.source}</td>
                      <td className="dy-time">{s.users}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!loading && tab === "costs" && costs && (
        <dl className="admin-costs" data-admin="costs">
          <div>
            <dt>{copy.llm}</dt>
            <dd className="dy-time">${costs.llm_usd.toFixed(4)}</dd>
          </div>
          <div>
            <dt>{copy.gpu}</dt>
            <dd className="dy-time">${costs.gpu_usd.toFixed(4)}</dd>
          </div>
          <div>
            <dt>{copy.api}</dt>
            <dd className="dy-time">${costs.api_usd.toFixed(4)}</dd>
          </div>
          <div className="admin-costs__total">
            <dt>{copy.total}</dt>
            <dd className="dy-time">${costs.total_usd.toFixed(4)}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}
