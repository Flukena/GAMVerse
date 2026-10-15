import { useState } from "react";
import "./MaintainerAccountSafety.css";

export type MaintainerAccount = {
  username: string;
  email: string | null;
  lastActiveAt: string | null;
  suspendedAt: string | null;
  role: "user" | "maintainer";
};

type SuspensionResponse = {
  suspendedAt?: string | null;
  user?: { suspendedAt?: string | null };
  activeSessionsDisconnected?: boolean;
  error?: string;
};

type RoleResponse = { role?: "user" | "maintainer"; activeSessionsDisconnected?: boolean; error?: string };

type MaintainerAccountSafetyProps = {
  accounts: MaintainerAccount[];
  loading?: boolean;
  loadError?: string | null;
  onRetry?: () => void;
  endpoint: string;
  currentUsername: string;
  onAccountUpdated: (account: MaintainerAccount) => void;
  resetUrls?: Record<string, string>;
  onGenerateResetLink?: (username: string) => void | Promise<void>;
};

function formatTimestamp(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}

export function MaintainerAccountSafety({ accounts, loading = false, loadError = null, onRetry, endpoint, currentUsername, onAccountUpdated, resetUrls = {}, onGenerateResetLink }: MaintainerAccountSafetyProps) {
  const [pendingUsername, setPendingUsername] = useState<string | null>(null);
  const [pendingResetUsername, setPendingResetUsername] = useState<string | null>(null);
  const [statusOverrides, setStatusOverrides] = useState<Record<string, string | null>>({});
  const [roleOverrides, setRoleOverrides] = useState<Record<string, "user" | "maintainer">>({});
  const [feedback, setFeedback] = useState<Record<string, { message: string; error: boolean }>>({});

  const setRowFeedback = (username: string, message: string, error: boolean) => {
    setFeedback((current) => ({ ...current, [username]: { message, error } }));
  };

  const generateResetLink = async (username: string) => {
    if (!onGenerateResetLink) return;
    setPendingResetUsername(username);
    setFeedback((current) => ({ ...current, [username]: { message: "", error: false } }));
    try {
      await onGenerateResetLink(username);
    } catch (cause) {
      setRowFeedback(username, cause instanceof Error ? cause.message : "Could not generate a reset link.", true);
    } finally {
      setPendingResetUsername(null);
    }
  };

  const copyResetLink = async (username: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setRowFeedback(username, "Reset link copied.", false);
    } catch {
      setRowFeedback(username, "Could not copy the reset link. Copy it from the link field instead.", true);
    }
  };

  const updateSuspension = async (account: MaintainerAccount) => {
    const currentlySuspended = statusOverrides[account.username] ?? account.suspendedAt;
    const nextSuspended = !currentlySuspended;
    const action = nextSuspended ? "suspend" : "reactivate";
    const confirmation = nextSuspended
      ? `Suspend ${account.username}? They will not be able to sign in or continue using active sessions.`
      : `Reactivate ${account.username}? They will be able to sign in again.`;
    if (!window.confirm(confirmation)) return;

    setPendingUsername(account.username);
    setFeedback((current) => ({ ...current, [account.username]: { message: "", error: false } }));
    try {
      const response = await fetch(`${endpoint}/maintainer/users/${encodeURIComponent(account.username)}/suspension`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suspended: nextSuspended }),
      });
      const result = await response.json().catch(() => ({})) as SuspensionResponse;
      const updated: MaintainerAccount = {
        ...account,
        suspendedAt: nextSuspended
          ? result.suspendedAt ?? result.user?.suspendedAt ?? new Date().toISOString()
          : result.suspendedAt ?? result.user?.suspendedAt ?? null,
      };
      if (!response.ok && (result.suspendedAt !== undefined || result.user?.suspendedAt !== undefined)) {
        setStatusOverrides((current) => ({ ...current, [account.username]: updated.suspendedAt }));
        onAccountUpdated(updated);
      }
      if (!response.ok) throw new Error(result.error ?? `Could not ${action} this account.`);
      setStatusOverrides((current) => ({ ...current, [account.username]: updated.suspendedAt }));
      onAccountUpdated(updated);
      setRowFeedback(account.username, nextSuspended ? "Account suspended." : "Account reactivated.", false);
    } catch (cause) {
      setRowFeedback(account.username, cause instanceof Error ? cause.message : `Could not ${action} this account.`, true);
    } finally {
      setPendingUsername(null);
    }
  };

  const updateRole = async (account: MaintainerAccount) => {
    const currentRole = roleOverrides[account.username] ?? account.role;
    const nextRole = currentRole === "maintainer" ? "user" : "maintainer";
    const action = nextRole === "maintainer" ? "grant maintainer access to" : "remove maintainer access from";
    if (!window.confirm(`Are you sure you want to ${action} ${account.username}? Their active sessions will be signed out.`)) return;

    setPendingUsername(account.username);
    setFeedback((current) => ({ ...current, [account.username]: { message: "", error: false } }));
    try {
      const response = await fetch(`${endpoint}/maintainer/users/${encodeURIComponent(account.username)}/role`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });
      const result = await response.json().catch(() => ({})) as RoleResponse;
      if (result.role === nextRole) {
        setRoleOverrides((current) => ({ ...current, [account.username]: nextRole }));
        onAccountUpdated({ ...account, role: nextRole });
      }
      if (!response.ok || result.role !== nextRole) throw new Error(result.error ?? "Could not change this account's role.");
      setRowFeedback(account.username, nextRole === "maintainer" ? "Maintainer access granted. They must sign in again." : "Maintainer access removed. They must sign in again.", false);
    } catch (cause) {
      setRowFeedback(account.username, cause instanceof Error ? cause.message : "Could not change this account's role.", true);
    } finally {
      setPendingUsername(null);
    }
  };

  return <section className="lobby-panel maintainer-account-safety" aria-labelledby="maintainer-account-safety-title">
    <div className="card-heading">
      <div><span className="eyebrow">ACCOUNT ACCESS</span><h2 id="maintainer-account-safety-title">Accounts</h2></div>
      <span className="count-chip">{accounts.length}</span>
    </div>
    <p className="empty-people">Grant or remove maintainer access, or suspend an account to block sign-in and revoke active sessions.</p>
    {loading ? <p className="empty-people" role="status">Loading platform accounts…</p> : loadError && accounts.length === 0 ? <div><p className="auth-error" role="alert">{loadError}</p>{onRetry && <button className="lobby-button" type="button" onClick={onRetry}>Retry</button>}</div> : accounts.length === 0 ? <p className="empty-people">No accounts found.</p> : <ul className="manager-member-list maintainer-account-safety-list">
      {accounts.map((account) => {
        const suspendedAt = statusOverrides[account.username] ?? account.suspendedAt;
        const role = roleOverrides[account.username] ?? account.role;
        const isSelf = account.username === currentUsername;
        const isPending = pendingUsername === account.username;
        const isResetPending = pendingResetUsername === account.username;
        const resetUrl = resetUrls[account.username];
        const rowFeedback = feedback[account.username];
        return <li key={account.username}>
          <div className="maintainer-account-safety-info">
            <strong>{account.username}</strong>
            <small>{account.email || "No email"} · Last active {formatTimestamp(account.lastActiveAt)}</small>
            <small>{role === "maintainer" ? "Platform role: Maintainer" : "Platform role: User"}</small>
            <small>{suspendedAt ? `Suspended ${formatTimestamp(suspendedAt)}` : "Active account"}</small>
          </div>
          <div className="maintainer-account-safety-actions">
            <span className={`maintainer-account-status${suspendedAt ? " is-suspended" : ""}`} role="status">{suspendedAt ? "Suspended" : "Active"}</span>
            <button
              className={`lobby-button${role === "maintainer" ? " danger" : " primary"}`}
              type="button"
              disabled={Boolean(pendingUsername) || isSelf}
              title={isSelf ? "You cannot change your own platform role." : undefined}
              onClick={() => void updateRole(account)}
            >{isPending ? "Saving…" : role === "maintainer" ? "Remove maintainer" : "Make maintainer"}</button>
            {onGenerateResetLink && <button className="lobby-button" type="button" disabled={isResetPending || Boolean(pendingUsername)} onClick={() => void generateResetLink(account.username)}>{isResetPending ? "Generating…" : "Generate reset link"}</button>}
            <button
              className={`lobby-button${suspendedAt ? " primary" : " danger"}`}
              type="button"
              disabled={Boolean(pendingUsername) || isSelf}
              title={isSelf ? "You cannot suspend your own maintainer account." : undefined}
              onClick={() => void updateSuspension(account)}
            >{isPending ? "Saving…" : suspendedAt ? "Reactivate" : "Suspend"}</button>
          </div>
          {resetUrl && <div className="invite-link-box account-reset-link maintainer-account-reset-link"><code>{resetUrl}</code><button className="lobby-button" type="button" onClick={() => void copyResetLink(account.username, resetUrl)}>Copy link</button><small>One use · expires in 15 minutes · generating another link invalidates this one</small></div>}
          {isSelf && <small className="maintainer-account-note">Your own maintainer account cannot be suspended here.</small>}
          {rowFeedback?.message && <small className={`maintainer-account-feedback${rowFeedback.error ? " is-error" : ""}`} role={rowFeedback.error ? "alert" : "status"} aria-live="polite">{rowFeedback.message}</small>}
        </li>;
      })}
    </ul>}
  </section>;
}
