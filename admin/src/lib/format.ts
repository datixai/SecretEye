import type { Timestamp } from "firebase/firestore";
import type { EmergencyAlert } from "./types";

export type Severity = "danger" | "warn" | "info";

export function severityOf(type?: string): Severity {
  const t = (type ?? "").toLowerCase();
  if (t === "weapon" || t === "gun" || t === "violence") return "danger";
  if (t === "stranger") return "warn";
  return "info";
}

export function detectionKind(type?: string): "Weapon" | "Violence" | "Stranger" | "Other" {
  const t = (type ?? "").toLowerCase();
  if (t === "weapon" || t === "gun") return "Weapon";
  if (t === "violence") return "Violence";
  if (t === "stranger") return "Stranger";
  return "Other";
}

export const toDate = (ts?: Timestamp | null) => (ts?.toDate ? ts.toDate() : null);
export const millis = (ts?: Timestamp | null) => ts?.toMillis?.() ?? 0;

export function timeAgo(ts?: Timestamp | null) {
  const d = toDate(ts);
  if (!d) return "just now";
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

export function dateTime(ts?: Timestamp | null) {
  const d = toDate(ts);
  return d ? d.toLocaleString([], { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
}

export function imageUri(v?: string | null) {
  if (!v) return null;
  if (v.startsWith("data:") || v.startsWith("http")) return v;
  return `data:image/jpeg;base64,${v}`;
}

export function initials(name?: string) {
  return (name ?? "?").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

/** Normalises old ("UNREAD"/"READ") and new emergency statuses. */
export function emergencyStatus(e: EmergencyAlert): "open" | "acknowledged" | "resolved" {
  if (e.status === "UNREAD") return "open";
  if (e.status === "READ") return "resolved";
  return e.status;
}
