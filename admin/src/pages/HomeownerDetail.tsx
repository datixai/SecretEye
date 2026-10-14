import { deleteDoc, doc, updateDoc } from "firebase/firestore";
import { ArrowLeft, Ban, Camera, CheckCircle2, Mail, MapPin, Pencil, Phone, ScanEye, ShieldCheck, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { DetectionThumb, TypeBadgeClass } from "@/components/DetectionImage";
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, Input, Modal, Spinner, Table, Td, confirm, toast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useCameras, useDetections, useTrusted, useUsers } from "@/lib/data";
import { dateTime, imageUri, timeAgo } from "@/lib/format";
import { db } from "@/lib/firebase";

type Tab = "detections" | "cameras" | "trusted";

export default function HomeownerDetail() {
  const { uid = "" } = useParams();
  const navigate = useNavigate();
  const users = useUsers();
  const cameras = useCameras(uid);
  const detections = useDetections(uid);
  const trusted = useTrusted(uid);
  const [tab, setTab] = useState<Tab>("detections");
  const [editing, setEditing] = useState(false);

  const user = users.byId.get(uid);
  if (users.loading) return <Spinner />;
  if (!user)
    return (
      <Card>
        <EmptyState icon={Users} title="Homeowner not found" action={<Button onClick={() => navigate("/homeowners")}>Back to homeowners</Button>} />
      </Card>
    );

  const toggleDisabled = async () => {
    const next = !user.disabled;
    const ok = await confirm({
      title: next ? `Disable ${user.fullName}?` : `Enable ${user.fullName}?`,
      message: next ? "They will be signed out of the app and can't use it until re-enabled." : "They will be able to use the app again.",
      confirmText: next ? "Disable" : "Enable",
      destructive: next,
    });
    if (!ok) return;
    await updateDoc(doc(db, "users", uid), { disabled: next });
    toast(next ? "Account disabled" : "Account enabled", { tone: "success" });
  };

  const makeAdmin = async () => {
    const ok = await confirm({ title: `Make ${user.fullName} an admin?`, message: "They'll get full access to this admin website and lose access to the homeowner app.", confirmText: "Make admin" });
    if (!ok) return;
    await updateDoc(doc(db, "users", uid), { role: "admin" });
    toast("Promoted to admin", { tone: "success" });
    navigate("/admins");
  };

  const removeProfile = async () => {
    const ok = await confirm({
      title: `Delete ${user.fullName}'s profile?`,
      message: "This removes their profile document. Their login stays in Firebase Authentication — delete it there too if needed.",
      confirmText: "Delete profile",
      destructive: true,
    });
    if (!ok) return;
    await deleteDoc(doc(db, "users", uid));
    toast("Profile deleted", { tone: "success" });
    navigate("/homeowners");
  };

  const tabs: { id: Tab; label: string; count: number; icon: typeof ScanEye }[] = [
    { id: "detections", label: "Detections", count: detections.data.length, icon: ScanEye },
    { id: "cameras", label: "Cameras", count: cameras.data.length, icon: Camera },
    { id: "trusted", label: "Trusted people", count: trusted.data.length, icon: ShieldCheck },
  ];

  return (
    <>
      <Link to="/homeowners" className="mb-4 inline-flex items-center gap-2 text-sm text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" /> Homeowners
      </Link>

      <Card className="mb-6 p-6">
        <div className="flex flex-wrap items-start gap-5">
          <Avatar name={user.fullName} photo={user.faceReference} size={72} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <h1 className="truncate text-2xl font-bold">{user.fullName}</h1>
              {user.disabled ? <Badge tone="danger">Disabled</Badge> : <Badge tone="ok">Active</Badge>}
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-muted sm:grid-cols-2">
              <span className="flex min-w-0 items-center gap-2"><Mail className="h-4 w-4 shrink-0" /> <span className="min-w-0 [overflow-wrap:anywhere]">{user.email}</span></span>
              <span className="flex items-center gap-2"><Phone className="h-4 w-4" /> {user.phoneNumber || "—"}</span>
              <span className="flex items-center gap-2 sm:col-span-2"><MapPin className="h-4 w-4" /> {user.address || "—"}</span>
            </div>
            <p className="mt-3 text-xs text-subtle">Joined {dateTime(user.createdAt)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>Edit</Button>
            <Button variant="secondary" icon={user.disabled ? CheckCircle2 : Ban} onClick={toggleDisabled}>{user.disabled ? "Enable" : "Disable"}</Button>
            <Button variant="secondary" icon={ShieldCheck} onClick={makeAdmin}>Make admin</Button>
            <Button variant="danger" icon={Trash2} onClick={removeProfile}>Delete</Button>
          </div>
        </div>
      </Card>

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn("-mb-px flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium sm:px-4", tab === t.id ? "border-accent text-accent" : "border-transparent text-muted hover:text-text")}
          >
            <t.icon className="h-4 w-4" /> {t.label} <span className="text-xs text-subtle">{t.count}</span>
          </button>
        ))}
      </div>

      {tab === "detections" ? (
        <Card>
          {detections.data.length === 0 ? (
            <EmptyState icon={ScanEye} title="No detections" />
          ) : (
            <Table head={["Snapshot", "Type", "Camera", "Status", "When"]}>
              {detections.data.map((d) => (
                <tr key={d.id}>
                  <Td><DetectionThumb d={d} /></Td>
                  <Td><Badge tone={TypeBadgeClass(d.type)}>{d.type}</Badge></Td>
                  <Td className="text-muted">{d.deviceName || "—"}</Td>
                  <Td>{d.status === "reviewed" ? <Badge tone="neutral">Reviewed</Badge> : <Badge tone="info">New</Badge>}</Td>
                  <Td right className="text-muted">{timeAgo(d.timestamp)}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      ) : tab === "cameras" ? (
        <Card>
          {cameras.data.length === 0 ? (
            <EmptyState icon={Camera} title="No cameras" />
          ) : (
            <Table head={["Name", "Address", "Status"]}>
              {cameras.data.map((c) => (
                <tr key={c.id}>
                  <Td className="font-medium">{c.name}</Td>
                  <Td className="font-mono text-xs text-muted">{c.ip}</Td>
                  <Td right><Badge tone={c.status === "Active" ? "ok" : c.status === "Disabled" ? "danger" : "neutral"}>{c.status === "Active" ? "On" : c.status}</Badge></Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      ) : (
        <Card>
          <CardHeader title="Trusted people" description="Faces this homeowner has whitelisted" />
          {trusted.data.length === 0 ? (
            <EmptyState icon={ShieldCheck} title="No trusted people" />
          ) : (
            <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
              {trusted.data.map((p) => (
                <div key={p.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                  <Avatar name={p.name} photo={p.image?.includes("ui-avatars.com") ? null : imageUri(p.image)} size={40} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-muted">{p.relation}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <EditUser open={editing} onClose={() => setEditing(false)} user={user} />
    </>
  );
}

function EditUser({ open, onClose, user }: { open: boolean; onClose: () => void; user: { uid: string; fullName: string; phoneNumber?: string; address?: string } }) {
  const [form, setForm] = useState({ fullName: user.fullName, phoneNumber: user.phoneNumber ?? "", address: user.address ?? "" });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (form.fullName.trim().length < 2) return toast("Enter a name", { tone: "error" });
    setSaving(true);
    try {
      await updateDoc(doc(db, "users", user.uid), { fullName: form.fullName.trim(), phoneNumber: form.phoneNumber.trim(), address: form.address.trim() });
      toast("Homeowner updated", { tone: "success" });
      onClose();
    } catch {
      toast("Couldn't save", { tone: "error" });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit homeowner"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={saving} onClick={save}>Save changes</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Full name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
        <Input label="Phone" value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} />
        <Input label="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
      </div>
    </Modal>
  );
}

