"use client";

import { useEffect, useState } from "react";
import { markAllNotificationsReadAction } from "@/app/(app)/actions";

type AlertItem = {
  id: string;
  eventType: string;
  title: string;
  message: string | null;
  href: string | null;
  payloadJson?: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
};

function notificationHref(notification: AlertItem): string {
  const payload = notification.payloadJson ?? {};
  const quoteId = typeof payload.quoteId === "string" ? payload.quoteId.trim() : "";
  const lineId = typeof payload.lineId === "string" ? payload.lineId.trim() : "";
  if (notification.eventType === "quote_line_response" && quoteId) {
    const focus = lineId ? `&focusLine=${encodeURIComponent(lineId)}#quote-line-${encodeURIComponent(lineId)}` : "";
    return `/quotes?selected=${encodeURIComponent(quoteId)}${focus}`;
  }
  const href = notification.href ?? "#";
  if (href.startsWith("/quotes?quote=")) return href.replace("/quotes?quote=", "/quotes?selected=");
  return href;
}

export function AlertsPopover({ initialNotifications, initialUnreadCount }: { initialNotifications: AlertItem[]; initialUnreadCount: number }) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setNotifications(initialNotifications);
    setUnreadCount(initialUnreadCount);
  }, [initialNotifications, initialUnreadCount]);

  const markAllRead = async () => {
    if (!unreadCount || saving) return;
    const previousNotifications = notifications;
    const previousUnreadCount = unreadCount;
    setNotifications((current) => current.map((notification) => ({ ...notification, isRead: true })));
    setUnreadCount(0);
    setSaving(true);
    setError("");
    try {
      await markAllNotificationsReadAction();
    } catch {
      setNotifications(previousNotifications);
      setUnreadCount(previousUnreadCount);
      setError("Could not mark alerts as read. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <details style={{ position: "relative" }}>
      <summary style={{ listStyle: "none", cursor: "pointer", minHeight: 42, display: "flex", alignItems: "center", gap: 9, padding: "0 14px", border: "1px solid #cbd5e1", borderRadius: 14, background: "#fff", boxShadow: "0 8px 22px rgba(15,23,42,.08)", fontWeight: 900, color: "#0f172a" }}>
        <span aria-hidden="true" style={{ fontSize: 19 }}>●</span> Alerts
        {unreadCount > 0 ? <span style={{ minWidth: 22, height: 22, borderRadius: 999, display: "grid", placeItems: "center", background: "#ef4444", color: "#fff", fontSize: 11 }}>{unreadCount}</span> : null}
      </summary>
      <div style={{ position: "absolute", right: 0, top: 50, width: "min(420px,calc(100vw - 40px))", maxHeight: 520, overflowY: "auto", border: "1px solid #dbe4f0", borderRadius: 18, background: "#fff", boxShadow: "0 24px 60px rgba(15,23,42,.18)", padding: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "4px 6px 10px" }}>
          <strong>Recent alerts</strong>
          {unreadCount > 0 ? <button type="button" disabled={saving} onClick={() => void markAllRead()} style={{ border: 0, background: "transparent", color: "#2563eb", fontWeight: 850, cursor: saving ? "wait" : "pointer" }}>{saving ? "Saving…" : "Mark all read"}</button> : null}
        </div>
        {error ? <div style={{ margin: "0 6px 8px", padding: "8px 10px", borderRadius: 10, background: "#fff1f2", color: "#b42318", fontSize: 12, fontWeight: 750 }}>{error}</div> : null}
        <div style={{ display: "grid", gap: 7 }}>
          {notifications.length ? notifications.map((notification) => <a key={notification.id} href={notificationHref(notification)} style={{ display: "grid", gap: 4, padding: 12, borderRadius: 13, border: notification.isRead ? "1px solid #e2e8f0" : "1px solid #93c5fd", background: notification.isRead ? "#fff" : "#eff6ff", textDecoration: "none", color: "inherit" }}>
            <span style={{ fontWeight: 900 }}>{notification.title}</span>
            {notification.message ? <span style={{ color: "#475569", fontSize: 13, lineHeight: 1.45 }}>{notification.message}</span> : null}
            <span style={{ color: "#94a3b8", fontSize: 11 }}>{new Date(notification.createdAt).toLocaleString("en-AU", { timeZone: "Australia/Sydney" })}</span>
          </a>) : <div style={{ padding: 18, color: "#64748b", textAlign: "center" }}>No alerts yet.</div>}
        </div>
      </div>
    </details>
  );
}
