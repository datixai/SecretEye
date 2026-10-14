import { CheckCircle2, Info, Loader2, TriangleAlert, X, XCircle, type LucideIcon } from "lucide-react";
import { useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { imageUri, initials } from "@/lib/format";

// ─── Button ────────────────────────────────────────────────────────────────
type Variant = "primary" | "secondary" | "danger" | "ghost";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent/90",
  secondary: "border border-border bg-surface2 text-text hover:bg-border/60",
  danger: "bg-danger text-white hover:bg-danger/90",
  ghost: "text-muted hover:bg-surface2 hover:text-text",
};

export function Button({
  variant = "primary",
  size = "md",
  icon: Icon,
  loading,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; icon?: LucideIcon; loading?: boolean }) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm",
        variants[variant],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className="h-4 w-4" /> : null}
      {children}
    </button>
  );
}

export function IconButton({ icon: Icon, label, tone, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string; tone?: "danger" }) {
  return (
    <button
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface2",
        tone === "danger" ? "hover:text-danger" : "hover:text-text",
        className,
      )}
      {...props}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

// ─── Layout ────────────────────────────────────────────────────────────────
/** Same header on every page: title + description on the left, actions on the right. */
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-xl border border-border bg-surface", className)}>{children}</div>;
}

export function CardHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function StatCard({ label, value, icon: Icon, tone = "accent", hint }: { label: string; value: ReactNode; icon: LucideIcon; tone?: "accent" | "danger" | "warn" | "ok"; hint?: string }) {
  const tones = { accent: "bg-accent/15 text-accent", danger: "bg-danger/15 text-danger", warn: "bg-warn/15 text-warn", ok: "bg-ok/15 text-ok" };
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted sm:text-sm">{label}</span>
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9", tones[tone])}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>
      <div className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">{value}</div>
      {hint ? <div className="mt-1 text-xs text-subtle">{hint}</div> : null}
    </Card>
  );
}

// ─── Badge / Avatar ───────────────────────────────────────────────────────
type Tone = "danger" | "warn" | "ok" | "info" | "neutral";
const badgeTones: Record<Tone, string> = {
  danger: "bg-danger/15 text-danger",
  warn: "bg-warn/15 text-warn",
  ok: "bg-ok/15 text-ok",
  info: "bg-accent/15 text-accent",
  neutral: "bg-surface2 text-muted",
};
export function Badge({ tone = "neutral", children, dot }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide", badgeTones[tone])}>
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

export function Avatar({ name, photo, size = 36 }: { name?: string; photo?: string | null; size?: number }) {
  const uri = imageUri(photo);
  return (
    <span
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-accent/15 font-semibold text-accent"
    >
      {uri ? <img src={uri} alt="" className="h-full w-full object-cover" /> : initials(name)}
    </span>
  );
}

// ─── Form controls ─────────────────────────────────────────────────────────
export function Input({ label, error, icon: Icon, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string; icon?: LucideIcon }) {
  return (
    <label className="block">
      {label ? <span className="mb-1.5 block text-sm font-medium text-muted">{label}</span> : null}
      <span className="relative block">
        {Icon ? <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" /> : null}
        <input
          className={cn(
            "h-10 w-full rounded-lg border bg-surface px-3 text-sm text-text placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-accent/40",
            error ? "border-danger" : "border-border focus:border-accent",
            Icon && "pl-9",
            className,
          )}
          {...props}
        />
      </span>
      {error ? <span className="mt-1 block text-xs text-danger">{error}</span> : null}
    </label>
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn("h-10 rounded-lg border border-border bg-surface px-3 text-sm text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40", className)}
      {...props}
    >
      {children}
    </select>
  );
}

// ─── Table ────────────────────────────────────────────────────────────────
export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-subtle">
            {head.map((h, i) => (
              <th key={i} className={cn("px-5 py-3 font-semibold", i === head.length - 1 && "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className, right }: { children: ReactNode; className?: string; right?: boolean }) {
  return <td className={cn("px-5 py-3 align-middle", right && "text-right", className)}>{children}</td>;
}

export function EmptyState({ icon: Icon, title, message, action }: { icon: LucideIcon; title: string; message?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/15 text-accent">
        <Icon className="h-6 w-6" />
      </span>
      <p className="mt-4 font-semibold">{title}</p>
      {message ? <p className="mt-1 max-w-sm text-sm text-muted">{message}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-center py-16", className)}>
      <Loader2 className="h-6 w-6 animate-spin text-accent" />
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
      <div className={cn("w-full rounded-xl border border-border bg-surface shadow-2xl", wide ? "max-w-3xl" : "max-w-md")} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">{title}</h2>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}

// ─── Toasts + confirm ─────────────────────────────────────────────────────
type ToastTone = "success" | "error" | "info" | "danger";
type ToastItem = { id: number; title: string; message?: string; tone: ToastTone };
let pushToast: (t: ToastItem) => void = () => {};
let openConfirm: (o: ConfirmOptions & { resolve: (v: boolean) => void }) => void = () => {};
let seq = 1;

export function toast(title: string, opts: { message?: string; tone?: ToastTone } = {}) {
  pushToast({ id: seq++, title, message: opts.message, tone: opts.tone ?? "info" });
}

type ConfirmOptions = { title: string; message?: string; confirmText?: string; destructive?: boolean };
export function confirm(o: ConfirmOptions) {
  return new Promise<boolean>((resolve) => openConfirm({ ...o, resolve }));
}

const toastIcon = { success: CheckCircle2, error: XCircle, info: Info, danger: TriangleAlert };
const toastColor = { success: "text-ok", error: "text-danger", info: "text-accent", danger: "text-danger" };

export function FeedbackHost() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [dialog, setDialog] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  useEffect(() => {
    pushToast = (t) => {
      setToasts((s) => [...s.slice(-3), t]);
      setTimeout(() => setToasts((s) => s.filter((x) => x.id !== t.id)), 4500);
    };
    openConfirm = setDialog;
  }, []);
  const close = (v: boolean) => {
    dialog?.resolve(v);
    setDialog(null);
  };
  return (
    <>
      <div className="fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2">
        {toasts.map((t) => {
          const Icon = toastIcon[t.tone];
          return (
            <div key={t.id} className="flex items-start gap-3 rounded-xl border border-border bg-surface2 p-3 shadow-xl">
              <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", toastColor[t.tone])} />
              <div className="text-sm">
                <p className="font-semibold">{t.title}</p>
                {t.message ? <p className="text-muted">{t.message}</p> : null}
              </div>
            </div>
          );
        })}
      </div>
      <Modal
        open={!!dialog}
        onClose={() => close(false)}
        title={dialog?.title ?? ""}
        footer={
          <>
            <Button variant="secondary" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button variant={dialog?.destructive ? "danger" : "primary"} onClick={() => close(true)}>
              {dialog?.confirmText ?? "Confirm"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">{dialog?.message}</p>
      </Modal>
    </>
  );
}
