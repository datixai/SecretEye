import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { CheckCheck, MapPin, Phone, ShieldCheck, Siren } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Avatar, Badge, Button, Card, EmptyState, PageHeader, Spinner, toast } from "@/components/ui";
import { useAdmin } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { useEmergencies, useUsers } from "@/lib/data";
import { dateTime, emergencyStatus, timeAgo } from "@/lib/format";
import { db } from "@/lib/firebase";

type Filter = "open" | "acknowledged" | "resolved" | "all";
const tone = { open: "danger", acknowledged: "warn", resolved: "ok" } as const;

export default function Emergencies() {
  const { profile } = useAdmin();
  const { data, loading } = useEmergencies();
  const users = useUsers();
  const [filter, setFilter] = useState<Filter>("open");

  const counts = { open: 0, acknowledged: 0, resolved: 0, all: data.length };
  data.forEach((e) => (counts[emergencyStatus(e)] += 1));
  const items = filter === "all" ? data : data.filter((e) => emergencyStatus(e) === filter);

  const setStatus = async (id: string, status: "acknowledged" | "resolved") => {
    try {
      await updateDoc(doc(db, "emergency_alerts", id), {
        status,
        ...(status === "acknowledged"
          ? { acknowledgedBy: profile.fullName || profile.email, acknowledgedAt: serverTimestamp() }
          : { resolvedBy: profile.fullName || profile.email, resolvedAt: serverTimestamp() }),
      });
      toast(status === "acknowledged" ? "Emergency acknowledged" : "Emergency resolved", { tone: "success", message: status === "acknowledged" ? "The homeowner can see that help is on the way." : undefined });
    } catch {
      toast("Couldn't update emergency", { tone: "error" });
    }
  };

  return (
    <>
      <PageHeader title="Emergencies" description="SOS alerts from homeowners. Acknowledge as soon as you start responding." />

      <div className="mb-4 flex flex-wrap gap-2">
        {(["open", "acknowledged", "resolved", "all"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "h-9 rounded-full border px-4 text-sm font-medium capitalize",
              filter === f ? "border-accent bg-accent text-accent-ink" : "border-border bg-surface text-muted hover:text-text",
            )}
          >
            {f} · {counts[f]}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState icon={ShieldCheck} title={filter === "open" ? "No open emergencies" : "Nothing here"} message="New SOS alerts appear here instantly with a sound." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {items.map((e) => {
            const status = emergencyStatus(e);
            const u = users.byId.get(e.userId);
            return (
              <Card key={e.id} className={cn("p-5", status === "open" && "border-danger/60 bg-danger/5")}>
                <div className="flex items-start gap-3">
                  <span className={cn("flex h-10 w-10 items-center justify-center rounded-lg", status === "open" ? "bg-danger/15 text-danger" : "bg-surface2 text-muted")}>
                    <Siren className={cn("h-5 w-5", status === "open" && "animate-pulse")} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <Badge tone={tone[status]} dot>
                        {status}
                      </Badge>
                      <span className="text-xs text-subtle" title={dateTime(e.timestamp)}>
                        {timeAgo(e.timestamp)}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <Avatar name={u?.fullName ?? e.userIdentifier} photo={u?.faceReference} size={40} />
                      <div className="min-w-0">
                        {u ? (
                          <Link to={`/homeowners/${u.uid}`} className="block truncate font-semibold hover:text-accent">
                            {u.fullName}
                          </Link>
                        ) : (
                          <p className="truncate font-semibold">{e.userIdentifier || "Unknown user"}</p>
                        )}
                        <p className="truncate text-xs text-muted">{u?.email}</p>
                      </div>
                    </div>
                    <div className="mt-3 space-y-1.5 text-sm text-muted">
                      {u?.phoneNumber ? (
                        <a href={`tel:${u.phoneNumber}`} className="flex items-center gap-2 hover:text-accent">
                          <Phone className="h-4 w-4" /> {u.phoneNumber}
                        </a>
                      ) : null}
                      {u?.address ? (
                        <p className="flex items-center gap-2">
                          <MapPin className="h-4 w-4" /> {u.address}
                        </p>
                      ) : null}
                      {e.acknowledgedBy ? <p className="text-xs">Acknowledged by {e.acknowledgedBy} · {dateTime(e.acknowledgedAt)}</p> : null}
                      {(e as { cancelledByUser?: boolean }).cancelledByUser ? <p className="text-xs text-warn">Cancelled by the homeowner</p> : null}
                    </div>
                    {status !== "resolved" ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {status === "open" ? (
                          <Button variant="danger" icon={CheckCheck} onClick={() => setStatus(e.id, "acknowledged")}>
                            Acknowledge
                          </Button>
                        ) : null}
                        <Button variant="secondary" icon={ShieldCheck} onClick={() => setStatus(e.id, "resolved")}>
                          Resolve
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
