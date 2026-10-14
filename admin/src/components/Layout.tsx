import { signOut } from "firebase/auth";
import { Bell, Camera, FlaskConical, LayoutDashboard, LogOut, Menu, ScanEye, ShieldCheck, Siren, Users, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAdmin } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { useEmergencies } from "@/lib/data";
import { emergencyStatus } from "@/lib/format";
import { auth } from "@/lib/firebase";
import { Avatar, confirm, toast } from "./ui";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/emergencies", label: "Emergencies", icon: Siren },
  { to: "/homeowners", label: "Homeowners", icon: Users },
  { to: "/detections", label: "Detections", icon: ScanEye },
  { to: "/cameras", label: "Cameras", icon: Camera },
  { to: "/admins", label: "Admins", icon: ShieldCheck },
  { to: "/ai-lab", label: "AI Lab", icon: FlaskConical },
];

/** Plays a short alarm tone and shows a toast for each new open emergency. */
function useEmergencyAlarm(openIds: string[], loading: boolean) {
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (loading) return;
    if (!seen.current) {
      seen.current = new Set(openIds);
      return;
    }
    const fresh = openIds.filter((id) => !seen.current!.has(id));
    fresh.forEach((id) => seen.current!.add(id));
    if (!fresh.length) return;
    toast("New SOS emergency", { tone: "danger", message: "A homeowner pressed the SOS button." });
    try {
      const ctx = new AudioContext();
      [0, 0.35, 0.7].forEach((t) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.15, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.3);
        o.connect(g).connect(ctx.destination);
        o.start(ctx.currentTime + t);
        o.stop(ctx.currentTime + t + 0.3);
      });
    } catch {
      /* audio blocked until first click — fine */
    }
  }, [openIds, loading]);
}

export function Layout() {
  const { profile } = useAdmin();
  const { data: emergencies, loading: emergenciesLoading } = useEmergencies();
  const openIds = emergencies.filter((e) => emergencyStatus(e) === "open").map((e) => e.id);
  useEmergencyAlarm(openIds, emergenciesLoading);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setMobileOpen(false), [location.pathname]);

  const logout = async () => {
    if (await confirm({ title: "Sign out?", confirmText: "Sign out" })) await signOut(auth);
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <img src="/logo.png" alt="" className="h-8 w-8" />
        <span className="text-lg font-bold">
          Secret<span className="text-accent">Eye</span>
        </span>
        <span className="ml-1 rounded bg-surface2 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">Admin</span>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-2">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              cn(
                "flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                isActive ? "bg-accent/15 text-accent" : "text-muted hover:bg-surface2 hover:text-text",
              )
            }
          >
            <n.icon className="h-[18px] w-[18px]" />
            <span className="flex-1">{n.label}</span>
            {n.to === "/emergencies" && openIds.length > 0 ? (
              <span className="rounded-full bg-danger px-1.5 text-[11px] font-bold text-white">{openIds.length}</span>
            ) : null}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <Avatar name={profile.fullName} photo={profile.faceReference} size={34} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{profile.fullName}</p>
            <p className="truncate text-xs text-subtle">{profile.email}</p>
          </div>
          <button onClick={logout} title="Sign out" className="rounded-lg p-2 text-muted hover:bg-surface2 hover:text-danger">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-full">
      <aside className="hidden w-64 shrink-0 border-r border-border bg-surface lg:block">{sidebar}</aside>
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="relative h-full w-64 border-r border-border bg-surface">{sidebar}</aside>
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border px-4 lg:px-8">
          <button className="rounded-lg p-2 text-muted hover:bg-surface2 lg:hidden" onClick={() => setMobileOpen((v) => !v)} aria-label="Menu">
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="flex items-center gap-2 lg:hidden">
            <img src="/logo.png" alt="" className="h-7 w-7" />
            <span className="font-bold">
              Secret<span className="text-accent">Eye</span>
            </span>
          </div>
          <div className="hidden text-sm text-muted lg:block">SecretEye control centre</div>
          <NavLink
            to="/emergencies"
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold",
              openIds.length ? "animate-pulse bg-danger text-white" : "text-muted hover:bg-surface2",
            )}
          >
            <Bell className="h-4 w-4" />
            {openIds.length ? `${openIds.length} open SOS` : "No open SOS"}
          </NavLink>
        </header>
        <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
