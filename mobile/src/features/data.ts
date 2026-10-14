import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { useMemo } from "react";
import { db } from "@/lib/firebase";
import {
  DEFAULT_SETTINGS,
  type Camera,
  type Detection,
  type EmergencyAlert,
  type TrustedPerson,
  type UserSettings,
} from "@/lib/types";
import { useLiveDoc, useLiveQuery } from "@/lib/useFirestore";
import { useUid } from "./auth/session";

// Sorting happens client-side so queries only need single-field indexes.
// Collections per homeowner are small (detections are pruned by the admin side).
const byTimeDesc = <T extends { timestamp?: { toMillis(): number }; createdAt?: { toMillis(): number } }>(a: T, b: T) =>
  ((b.timestamp ?? b.createdAt)?.toMillis?.() ?? Date.now()) - ((a.timestamp ?? a.createdAt)?.toMillis?.() ?? Date.now());

// ─── Detections (alerts) ────────────────────────────────────────────────────
export function useDetections() {
  const uid = useUid();
  const q = useMemo(() => (uid ? query(collection(db, "detections"), where("userId", "==", uid)) : null), [uid]);
  const res = useLiveQuery<Detection>(q, [q]);
  const data = useMemo(() => [...res.data].sort(byTimeDesc), [res.data]);
  return { ...res, data };
}

export function useDetection(id?: string) {
  return useLiveDoc<Detection>(id ? `detections/${id}` : null);
}

export const markReviewed = (id: string) => updateDoc(doc(db, "detections", id), { status: "reviewed" });
export const deleteDetection = (id: string) => deleteDoc(doc(db, "detections", id));

// ─── Cameras ────────────────────────────────────────────────────────────────
export function useCameras() {
  const uid = useUid();
  const q = useMemo(() => (uid ? query(collection(db, "devices"), where("userId", "==", uid)) : null), [uid]);
  const res = useLiveQuery<Camera>(q, [q]);
  const data = useMemo(() => [...res.data].sort((a, b) => a.name.localeCompare(b.name)), [res.data]);
  return { ...res, data };
}

export function useCamera(id?: string) {
  return useLiveDoc<Camera>(id ? `devices/${id}` : null);
}

export async function saveCamera(uid: string, data: { name: string; ip: string }, id?: string) {
  if (id) return updateDoc(doc(db, "devices", id), { name: data.name, ip: data.ip });
  return addDoc(collection(db, "devices"), {
    userId: uid,
    name: data.name,
    ip: data.ip,
    type: "ip",
    status: "Active",
    createdAt: serverTimestamp(),
  });
}

export const setCameraActive = (id: string, active: boolean) =>
  updateDoc(doc(db, "devices", id), { status: active ? "Active" : "Inactive" });
export const deleteCamera = (id: string) => deleteDoc(doc(db, "devices", id));

// ─── Settings ───────────────────────────────────────────────────────────────
export function useSettings() {
  const uid = useUid();
  const { data, loading } = useLiveDoc<Partial<UserSettings> & Record<string, unknown>>(uid ? `settings/${uid}` : null);
  // Accept legacy field names too.
  const settings: UserSettings = {
    armed: (data?.armed as boolean | undefined) ?? DEFAULT_SETTINGS.armed,
    faceEnabled: (data?.faceEnabled ?? data?.isFaceEnabled ?? DEFAULT_SETTINGS.faceEnabled) as boolean,
    weaponEnabled: (data?.weaponEnabled ?? data?.isWeaponAlertEnabled ?? DEFAULT_SETTINGS.weaponEnabled) as boolean,
    violenceEnabled: (data?.violenceEnabled as boolean | undefined) ?? DEFAULT_SETTINGS.violenceEnabled,
  };
  return { settings, loading };
}

export const updateSettings = (uid: string, patch: Partial<UserSettings>) =>
  setDoc(doc(db, "settings", uid), patch, { merge: true });

// ─── Trusted people ─────────────────────────────────────────────────────────
export function useTrustedPeople() {
  const uid = useUid();
  const q = useMemo(
    () => (uid ? query(collection(db, "trusted_visitors"), where("homeownerId", "==", uid)) : null),
    [uid],
  );
  const res = useLiveQuery<TrustedPerson>(q, [q]);
  const data = useMemo(() => [...res.data].sort((a, b) => a.name.localeCompare(b.name)), [res.data]);
  return { ...res, data };
}

export function useTrustedPerson(id?: string) {
  return useLiveDoc<TrustedPerson>(id ? `trusted_visitors/${id}` : null);
}

export async function saveTrustedPerson(
  uid: string,
  data: { name: string; relation: string; image?: string | null },
  id?: string,
) {
  const payload = { name: data.name, relation: data.relation, image: data.image ?? null, homeownerId: uid, updatedAt: serverTimestamp() };
  if (id) return updateDoc(doc(db, "trusted_visitors", id), payload);
  return addDoc(collection(db, "trusted_visitors"), { ...payload, alerts: false, createdAt: serverTimestamp() });
}

export const deleteTrustedPerson = (id: string) => deleteDoc(doc(db, "trusted_visitors", id));

// ─── Emergencies ────────────────────────────────────────────────────────────
export function useMyEmergencies() {
  const uid = useUid();
  const q = useMemo(() => (uid ? query(collection(db, "emergency_alerts"), where("userId", "==", uid)) : null), [uid]);
  const res = useLiveQuery<EmergencyAlert>(q, [q]);
  const data = useMemo(() => [...res.data].sort(byTimeDesc), [res.data]);
  return { ...res, data };
}

export async function sendEmergency(uid: string, identifier: string) {
  const ref = await addDoc(collection(db, "emergency_alerts"), {
    userId: uid,
    userIdentifier: identifier,
    type: "PANIC_BUTTON",
    priority: "CRITICAL",
    status: "open",
    timestamp: serverTimestamp(),
  });
  return ref.id;
}

export const cancelEmergency = (id: string) =>
  updateDoc(doc(db, "emergency_alerts", id), { status: "resolved", cancelledByUser: true, resolvedAt: serverTimestamp() });
