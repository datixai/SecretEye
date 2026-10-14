import { deleteDoc, doc, updateDoc } from "firebase/firestore";
import { Check, ScanEye, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DetectionThumb, TypeBadgeClass } from "@/components/DetectionImage";
import { Badge, Button, Card, EmptyState, IconButton, Modal, PageHeader, Select, Spinner, Table, Td, confirm, toast } from "@/components/ui";
import { useDetections, useUsers } from "@/lib/data";
import { dateTime, detectionKind, imageUri, timeAgo, toDate } from "@/lib/format";
import { db } from "@/lib/firebase";
import type { Detection } from "@/lib/types";

const PAGE = 50;

export default function Detections() {
  const { data, loading } = useDetections();
  const users = useUsers();
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [owner, setOwner] = useState("all");
  const [range, setRange] = useState("all");
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<Detection | null>(null);

  const owners = useMemo(() => [...new Set(data.map((d) => d.userId))].map((id) => users.byId.get(id)).filter(Boolean), [data, users.byId]);

  const rows = useMemo(() => {
    const since = range === "24h" ? Date.now() - 86400000 : range === "7d" ? Date.now() - 7 * 86400000 : 0;
    return data.filter(
      (d) =>
        (type === "all" || detectionKind(d.type) === type) &&
        (status === "all" || (status === "new" ? d.status !== "reviewed" : d.status === "reviewed")) &&
        (owner === "all" || d.userId === owner) &&
        (!since || (toDate(d.timestamp)?.getTime() ?? Date.now()) >= since),
    );
  }, [data, type, status, owner, range]);

  const markReviewed = async (d: Detection) => {
    await updateDoc(doc(db, "detections", d.id), { status: "reviewed" });
    toast("Marked as reviewed", { tone: "success" });
  };

  const remove = async (d: Detection) => {
    if (!(await confirm({ title: "Delete this detection?", message: "The snapshot is removed for the homeowner too.", confirmText: "Delete", destructive: true }))) return;
    await deleteDoc(doc(db, "detections", d.id));
    setOpen(null);
    toast("Detection deleted", { tone: "success" });
  };

  return (
    <>
      <PageHeader title="Detections" description="Every AI detection across all homes." />

      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">All types</option>
          <option value="Weapon">Weapons</option>
          <option value="Violence">Violence</option>
          <option value="Stranger">Strangers</option>
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">Any status</option>
          <option value="new">New</option>
          <option value="reviewed">Reviewed</option>
        </Select>
        <Select value={range} onChange={(e) => setRange(e.target.value)}>
          <option value="all">All time</option>
          <option value="24h">Last 24 hours</option>
          <option value="7d">Last 7 days</option>
        </Select>
        <Select value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="all">All homeowners</option>
          {owners.map((u) => (
            <option key={u!.uid} value={u!.uid}>
              {u!.fullName || u!.email}
            </option>
          ))}
        </Select>
        <span className="ml-auto self-center text-sm text-muted">{rows.length} results</span>
      </div>

      <Card>
        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState icon={ScanEye} title="No detections" message="Try different filters." />
        ) : (
          <>
            <Table head={["Snapshot", "Type", "Homeowner", "Camera", "Status", "When", ""]}>
              {rows.slice(0, limit).map((d) => {
                const u = users.byId.get(d.userId);
                return (
                  <tr key={d.id} className="cursor-pointer hover:bg-surface2/60" onClick={() => setOpen(d)}>
                    <Td><DetectionThumb d={d} /></Td>
                    <Td><Badge tone={TypeBadgeClass(d.type)}>{d.type}</Badge></Td>
                    <Td>
                      {u ? (
                        <Link to={`/homeowners/${u.uid}`} onClick={(e) => e.stopPropagation()} className="hover:text-accent">
                          {u.fullName || u.email}
                        </Link>
                      ) : (
                        <span className="text-subtle">Unknown</span>
                      )}
                    </Td>
                    <Td className="text-muted">{d.deviceName || "—"}</Td>
                    <Td>{d.status === "reviewed" ? <Badge>Reviewed</Badge> : <Badge tone="info">New</Badge>}</Td>
                    <Td className="whitespace-nowrap text-muted">{timeAgo(d.timestamp)}</Td>
                    <Td right>
                      <span className="inline-flex gap-1" onClick={(e) => e.stopPropagation()}>
                        {d.status !== "reviewed" ? <IconButton icon={Check} label="Mark reviewed" onClick={() => markReviewed(d)} /> : null}
                        <IconButton icon={Trash2} label="Delete" tone="danger" onClick={() => remove(d)} />
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </Table>
            {rows.length > limit ? (
              <div className="border-t border-border p-3 text-center">
                <Button variant="ghost" onClick={() => setLimit((l) => l + PAGE)}>
                  Show more
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Card>

      <Modal
        wide
        open={!!open}
        onClose={() => setOpen(null)}
        title={open ? `${open.type} — ${open.deviceName || "Camera"}` : ""}
        footer={
          open ? (
            <>
              <Button variant="danger" icon={Trash2} onClick={() => remove(open)}>Delete</Button>
              {open.status !== "reviewed" ? <Button icon={Check} onClick={() => markReviewed(open).then(() => setOpen(null))}>Mark reviewed</Button> : null}
            </>
          ) : null
        }
      >
        {open ? (
          <>
            {imageUri(open.imageUrl) ? (
              <img src={imageUri(open.imageUrl)!} alt="" className="w-full rounded-lg border border-border" />
            ) : (
              <EmptyState icon={ScanEye} title="No snapshot" />
            )}
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <p><span className="text-subtle">Homeowner:</span> {users.byId.get(open.userId)?.fullName ?? "Unknown"}</p>
              <p><span className="text-subtle">When:</span> {dateTime(open.timestamp)}</p>
              <p><span className="text-subtle">Priority:</span> {open.priority ?? "—"}</p>
              <p><span className="text-subtle">Status:</span> {open.status === "reviewed" ? "Reviewed" : "New"}</p>
            </div>
          </>
        ) : null}
      </Modal>
    </>
  );
}
