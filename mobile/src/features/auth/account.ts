import { deleteUser, EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import { collection, deleteDoc, doc, getDocs, query, where, writeBatch } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

async function reauth(password: string) {
  const user = auth.currentUser;
  if (!user?.email) throw new Error("not-signed-in");
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
  return user;
}

export async function changePassword(current: string, next: string) {
  const user = await reauth(current);
  await updatePassword(user, next);
}

/**
 * Permanently deletes the homeowner's data and login (Play Store requires
 * in-app account deletion). Emergency records are kept for the control centre.
 */
export async function deleteAccount(password: string) {
  const user = await reauth(password);
  const uid = user.uid;
  const owned: [string, string][] = [
    ["detections", "userId"],
    ["devices", "userId"],
    ["trusted_visitors", "homeownerId"],
  ];
  for (const [col, field] of owned) {
    const snap = await getDocs(query(collection(db, col), where(field, "==", uid)));
    for (let i = 0; i < snap.docs.length; i += 450) {
      const batch = writeBatch(db);
      snap.docs.slice(i, i + 450).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }
  await deleteDoc(doc(db, "settings", uid)).catch(() => {});
  await deleteDoc(doc(db, "users", uid));
  await deleteUser(user);
}
