import { deleteDoc, doc, updateDoc } from "firebase/firestore";
import { Camera, Power, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar, Badge, Card, EmptyState, IconButton, Input, PageHeader, Spinner, Table, Td, confirm, toast } from "@/components/ui";
import { useCameras, useUsers } from "@/lib/data";
import type { Camera as Cam } from "@/lib/types";
import { db } from "@/lib/firebase";

export default function Cameras() {
  const { data, loading } = useCameras();
  const users = useUsers();
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return data.filter((c) => {
      const u = users.byId.get(c.userId);
      return [c.name, c.ip, u?.fullName, u?.email].join(" ").toLowerCase().includes(s);
    });
  }, [data, q, users.byId]);

  const toggle = async (c: Cam) => {
    // "Disabled" = turned off by an admin; the homeowner's own toggle uses "Inactive".
    const next = c.status === "Active" ? "Disabled" : "Active";
    await updateDoc(doc(db, "devices", c.id), { status: next });
    toast(next === "Active" ? "Camera enabled" : "Camera disabled", { tone: "success" });
  };

  const remove = async (c: Cam) => {
    if (!(await confirm({ title: `Delete “${c.name}”?`, message: "The homeowner will no longer see this camera.", confirmText: "Delete", destructive: true }))) return;
    await deleteDoc(doc(db, "devices", c.id));
    toast("Camera deleted", { tone: "success" });
  };

  return (
    <>
      <PageHeader
        title="Cameras"
        description="All camera nodes registered by homeowners."
        actions={<Input icon={Search} placeholder="Search camera or owner…" value={q} onChange={(e) => setQ(e.target.value)} className="w-72" />}
      />
      <Card>
        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState icon={Camera} title={q ? "No matches" : "No cameras yet"} />
        ) : (
          <Table head={["Camera", "Address", "Homeowner", "Status", ""]}>
            {rows.map((c) => {
              const u = users.byId.get(c.userId);
              return (
                <tr key={c.id} className="hover:bg-surface2/60">
                  <Td className="font-medium">{c.name}</Td>
                  <Td className="font-mono text-xs text-muted">{c.ip}</Td>
                  <Td>
                    {u ? (
                      <Link to={`/homeowners/${u.uid}`} className="flex items-center gap-2 hover:text-accent">
                        <Avatar name={u.fullName} photo={u.faceReference} size={26} /> {u.fullName || u.email}
                      </Link>
                    ) : (
                      <span className="text-subtle">Unknown</span>
                    )}
                  </Td>
                  <Td>
                    <Badge tone={c.status === "Active" ? "ok" : c.status === "Disabled" ? "danger" : "neutral"} dot>
                      {c.status === "Active" ? "On" : c.status === "Disabled" ? "Disabled by admin" : "Off"}
                    </Badge>
                  </Td>
                  <Td right>
                    <span className="inline-flex gap-1">
                      <IconButton icon={Power} label={c.status === "Active" ? "Disable" : "Enable"} onClick={() => toggle(c)} />
                      <IconButton icon={Trash2} label="Delete" tone="danger" onClick={() => remove(c)} />
                    </span>
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </>
  );
}
