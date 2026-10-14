import { doc, updateDoc } from "firebase/firestore";
import { ShieldCheck, UserMinus, UserPlus } from "lucide-react";
import { useState } from "react";
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, Modal, PageHeader, Select, Spinner, Table, Td, confirm, toast } from "@/components/ui";
import { useAdmin } from "@/lib/auth";
import { useUsers } from "@/lib/data";
import { db } from "@/lib/firebase";

export default function Admins() {
  const { user: me } = useAdmin();
  const users = useUsers();
  const [adding, setAdding] = useState(false);
  const [pick, setPick] = useState("");

  const admins = users.data.filter((u) => u.role === "admin");
  const homeowners = users.data.filter((u) => u.role !== "admin");

  const demote = async (uid: string, name: string) => {
    if (!(await confirm({ title: `Remove admin access for ${name}?`, message: "They'll become a homeowner and can use the mobile app.", confirmText: "Remove access", destructive: true }))) return;
    await updateDoc(doc(db, "users", uid), { role: "homeowner" });
    toast("Admin access removed", { tone: "success" });
  };

  const promote = async () => {
    if (!pick) return;
    await updateDoc(doc(db, "users", pick), { role: "admin" });
    toast("Admin added", { tone: "success" });
    setAdding(false);
    setPick("");
  };

  return (
    <>
      <PageHeader
        title="Admins"
        description="People who can sign in to this control centre."
        actions={<Button icon={UserPlus} onClick={() => setAdding(true)}>Add admin</Button>}
      />
      <Card>
        <CardHeader title={`${admins.length} admin${admins.length === 1 ? "" : "s"}`} description="To add someone, they first create an account in the app, then you promote them here." />
        {users.loading ? (
          <Spinner />
        ) : admins.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="No admins" />
        ) : (
          <Table head={["Admin", "Phone", ""]}>
            {admins.map((a) => (
              <tr key={a.uid}>
                <Td>
                  <div className="flex items-center gap-3">
                    <Avatar name={a.fullName} photo={a.faceReference} />
                    <div>
                      <p className="font-medium">
                        {a.fullName} {a.uid === me.uid ? <Badge tone="info">You</Badge> : null}
                      </p>
                      <p className="text-xs text-muted">{a.email}</p>
                    </div>
                  </div>
                </Td>
                <Td className="text-muted">{a.phoneNumber || "—"}</Td>
                <Td right>
                  {a.uid !== me.uid ? (
                    <Button size="sm" variant="secondary" icon={UserMinus} onClick={() => demote(a.uid, a.fullName)}>
                      Remove access
                    </Button>
                  ) : null}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add admin"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdding(false)}>Cancel</Button>
            <Button disabled={!pick} onClick={promote}>Make admin</Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-muted">Choose an existing account. They'll lose access to the homeowner app.</p>
        <Select value={pick} onChange={(e) => setPick(e.target.value)} className="w-full">
          <option value="">Select a user…</option>
          {homeowners.map((u) => (
            <option key={u.uid} value={u.uid}>
              {u.fullName} — {u.email}
            </option>
          ))}
        </Select>
      </Modal>
    </>
  );
}
