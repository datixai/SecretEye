import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { db } from "./firebase";
import { millis } from "./format";
import type { Camera, Detection, EmergencyAlert, TrustedPerson, UserProfile } from "./types";

/** Live collection subscription, optionally filtered by one field. */
export function useCollection<T>(name: string, filter?: { field: string; value: string }) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const field = filter?.field;
  const value = filter?.value;
  useEffect(() => {
    setLoading(true);
    const ref = collection(db, name);
    return onSnapshot(
      field ? query(ref, where(field, "==", value)) : ref,
      (snap) => {
        setData(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T));
        setLoading(false);
        setError(null);
      },
      (e) => {
        setError(e.code);
        setLoading(false);
      },
    );
  }, [name, field, value]);
  return { data, loading, error };
}

const newestFirst = <T extends { timestamp?: Detection["timestamp"] }>(a: T, b: T) =>
  (millis(b.timestamp) || Date.now()) - (millis(a.timestamp) || Date.now());

export function useUsers() {
  const res = useCollection<UserProfile & { id: string }>("users");
  const data = useMemo(
    () => res.data.map((u) => ({ ...u, uid: u.uid || u.id })).sort((a, b) => (a.fullName || a.email || "").localeCompare(b.fullName || b.email || "")),
    [res.data],
  );
  const byId = useMemo(() => new Map(data.map((u) => [u.uid, u])), [data]);
  return { ...res, data, byId };
}

export function useDetections(userId?: string) {
  const res = useCollection<Detection>("detections", userId ? { field: "userId", value: userId } : undefined);
  const data = useMemo(() => [...res.data].sort(newestFirst), [res.data]);
  return { ...res, data };
}

export function useCameras(userId?: string) {
  const res = useCollection<Camera>("devices", userId ? { field: "userId", value: userId } : undefined);
  const data = useMemo(() => [...res.data].sort((a, b) => a.name.localeCompare(b.name)), [res.data]);
  return { ...res, data };
}

export function useEmergencies() {
  const res = useCollection<EmergencyAlert>("emergency_alerts");
  const data = useMemo(() => [...res.data].sort(newestFirst), [res.data]);
  return { ...res, data };
}

export function useTrusted(userId: string) {
  return useCollection<TrustedPerson>("trusted_visitors", { field: "homeownerId", value: userId });
}
