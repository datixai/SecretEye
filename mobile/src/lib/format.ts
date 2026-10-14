import type { Timestamp } from "firebase/firestore";
import type { Detection } from "./types";
import { colors } from "@/theme/colors";

export type Severity = "danger" | "warn" | "info";

export function severityOf(type?: string): Severity {
  const t = (type ?? "").toLowerCase();
  if (t === "weapon" || t === "gun" || t === "violence" || t.includes("panic")) return "danger";
  if (t === "stranger") return "warn";
  return "info";
}

export const severityColor: Record<Severity, string> = {
  danger: colors.danger,
  warn: colors.warn,
  info: colors.accent,
};

export function detectionIcon(type?: string) {
  const t = (type ?? "").toLowerCase();
  if (t === "weapon" || t === "gun") return "warning" as const;
  if (t === "violence") return "flash" as const;
  if (t === "stranger") return "person" as const;
  return "alert-circle" as const;
}

export function detectionTitle(d: Pick<Detection, "type">) {
  const t = (d.type ?? "").toLowerCase();
  if (t === "weapon" || t === "gun") return "Weapon detected";
  if (t === "violence") return "Violence detected";
  if (t === "stranger") return "Unknown person";
  return d.type || "Alert";
}

/** Normalises the filter bucket so "Gun" and "Weapon" group together. */
export function detectionKind(type?: string): "Weapon" | "Violence" | "Stranger" | "Other" {
  const t = (type ?? "").toLowerCase();
  if (t === "weapon" || t === "gun") return "Weapon";
  if (t === "violence") return "Violence";
  if (t === "stranger") return "Stranger";
  return "Other";
}

export function toDate(ts?: Timestamp | null): Date | null {
  return ts?.toDate ? ts.toDate() : null;
}

export function timeAgo(ts?: Timestamp | null): string {
  const d = toDate(ts);
  if (!d) return "Just now";
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

export function fullDateTime(ts?: Timestamp | null): string {
  const d = toDate(ts);
  if (!d) return "—";
  return d.toLocaleString([], {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Turns a stored base64 / data URI / https value into something <Image> can show. */
export function imageUri(value?: string | null): string | null {
  if (!value) return null;
  if (value.startsWith("data:") || value.startsWith("http") || value.startsWith("file:")) return value;
  return `data:image/jpeg;base64,${value}`;
}

export function initials(name?: string) {
  return (name ?? "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function firstName(name?: string) {
  return (name ?? "").trim().split(" ")[0] || "there";
}
