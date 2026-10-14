import { Search, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar, Badge, Card, EmptyState, Input, PageHeader, Spinner, Table, Td } from "@/components/ui";
import { useCameras, useDetections, useUsers } from "@/lib/data";
import { timeAgo } from "@/lib/format";

export default function Homeowners() {
  const users = useUsers();
  const cameras = useCameras();
  const detections = useDetections();
  const [q, setQ] = useState("");
  const navigate = useNavigate();

  const stats = useMemo(() => {
    const m = new Map<string, { cams: number; dets: number }>();
    const get = (id: string) => m.get(id) ?? (m.set(id, { cams: 0, dets: 0 }), m.get(id)!);
    cameras.data.forEach((c) => get(c.userId).cams++);
    detections.data.forEach((d) => get(d.userId).dets++);
    return m;
  }, [cameras.data, detections.data]);

  const rows = users.data
    .filter((u) => u.role !== "admin")
    .filter((u) => [u.fullName, u.email, u.phoneNumber, u.address].join(" ").toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <>
      <PageHeader
        title="Homeowners"
        description="Everyone using the SecretEye app. New homeowners sign up from the app."
        actions={<Input icon={Search} placeholder="Search name, email, phone…" value={q} onChange={(e) => setQ(e.target.value)} className="w-72" />}
      />
      <Card>
        {users.loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState icon={Users} title={q ? "No matches" : "No homeowners yet"} />
        ) : (
          <Table head={["Homeowner", "Phone", "Cameras", "Detections", "Joined", "Status"]}>
            {rows.map((u) => {
              const s = stats.get(u.uid);
              return (
                <tr key={u.uid} onClick={() => navigate(`/homeowners/${u.uid}`)} className="cursor-pointer hover:bg-surface2/60">
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar name={u.fullName} photo={u.faceReference} />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{u.fullName || "—"}</p>
                        <p className="truncate text-xs text-muted">{u.email}</p>
                      </div>
                    </div>
                  </Td>
                  <Td className="text-muted">{u.phoneNumber || "—"}</Td>
                  <Td>{s?.cams ?? 0}</Td>
                  <Td>{s?.dets ?? 0}</Td>
                  <Td className="text-muted">{u.createdAt ? timeAgo(u.createdAt) : "—"}</Td>
                  <Td right>{u.disabled ? <Badge tone="danger">Disabled</Badge> : <Badge tone="ok">Active</Badge>}</Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </>
  );
}
