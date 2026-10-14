import { Camera, ScanEye, Siren, Users } from "lucide-react";
import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DetectionThumb, TypeBadgeClass } from "@/components/DetectionImage";
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, Spinner, StatCard } from "@/components/ui";
import { useCameras, useDetections, useEmergencies, useUsers } from "@/lib/data";
import { detectionKind, emergencyStatus, timeAgo, toDate } from "@/lib/format";

const DAY = 86400000;

export default function Overview() {
  const users = useUsers();
  const detections = useDetections();
  const cameras = useCameras();
  const emergencies = useEmergencies();
  const navigate = useNavigate();

  const homeowners = users.data.filter((u) => u.role !== "admin");
  const openSos = emergencies.data.filter((e) => emergencyStatus(e) === "open");
  const camsOn = cameras.data.filter((c) => c.status === "Active").length;
  const last24 = detections.data.filter((d) => (toDate(d.timestamp)?.getTime() ?? Date.now()) > Date.now() - DAY).length;

  const chart = useMemo(() => {
    const days: { day: string; Weapon: number; Violence: number; Stranger: number; key: string }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * DAY);
      days.push({ key: d.toDateString(), day: d.toLocaleDateString([], { day: "numeric", month: "short" }), Weapon: 0, Violence: 0, Stranger: 0 });
    }
    const idx = new Map(days.map((d, i) => [d.key, i]));
    for (const det of detections.data) {
      const date = toDate(det.timestamp);
      if (!date) continue;
      const i = idx.get(date.toDateString());
      const k = detectionKind(det.type);
      if (i !== undefined && k !== "Other") days[i]![k] += 1;
    }
    return days;
  }, [detections.data]);

  if (users.loading || detections.loading) return <Spinner />;

  return (
    <>
      <PageHeader title="Overview" description="Live status of every SecretEye home." />

      {openSos.length ? (
        <Link to="/emergencies" className="mb-6 flex items-center gap-3 rounded-xl border border-danger/50 bg-danger/10 p-4 text-danger">
          <Siren className="h-5 w-5 animate-pulse" />
          <span className="flex-1 font-semibold">
            {openSos.length} open SOS emergenc{openSos.length === 1 ? "y" : "ies"} need attention
          </span>
          <span className="text-sm font-semibold underline">Respond now</span>
        </Link>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Homeowners" value={homeowners.length} icon={Users} />
        <StatCard label="Cameras on" value={`${camsOn}/${cameras.data.length}`} icon={Camera} tone="ok" />
        <StatCard label="Detections (24h)" value={last24} icon={ScanEye} tone="warn" hint={`${detections.data.length} total`} />
        <StatCard label="Open SOS" value={openSos.length} icon={Siren} tone={openSos.length ? "danger" : "accent"} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Detections — last 14 days" description="By threat type, across all homes" />
          <div className="h-72 px-2 py-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ left: -16, right: 8 }}>
                <CartesianGrid stroke="#24324A" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "rgba(148,163,184,0.08)" }} contentStyle={{ background: "#1B2638", border: "1px solid #24324A", borderRadius: 8, color: "#E5E7EB" }} />
                <Legend wrapperStyle={{ fontSize: 12, color: "#94A3B8" }} />
                <Bar dataKey="Weapon" stackId="a" fill="#EF4444" />
                <Bar dataKey="Violence" stackId="a" fill="#F97316" />
                <Bar dataKey="Stranger" stackId="a" fill="#F59E0B" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Latest detections" actions={<Button size="sm" variant="ghost" onClick={() => navigate("/detections")}>View all</Button>} />
          {detections.data.length === 0 ? (
            <EmptyState icon={ScanEye} title="No detections yet" />
          ) : (
            <ul className="divide-y divide-border">
              {detections.data.slice(0, 7).map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-5 py-3">
                  <DetectionThumb d={d} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge tone={TypeBadgeClass(d.type)}>{d.type}</Badge>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted">
                      {users.byId.get(d.userId)?.fullName ?? "Unknown"} · {d.deviceName || "Camera"}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-subtle">{timeAgo(d.timestamp)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
