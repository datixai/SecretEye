import { doc, onSnapshot, type DocumentData, type Query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "./firebase";

/** Live query → typed array with id. Pass null to skip. */
export function useLiveQuery<T>(q: Query<DocumentData> | null, deps: unknown[]) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(!!q);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!q) {
      setLoading(false);
      return;
    }
    setLoading(true);
    return onSnapshot(
      q,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, loading, error };
}

/** Live single document → typed object with id, or null. */
export function useLiveDoc<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!path);
  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }
    setLoading(true);
    return onSnapshot(
      doc(db, path),
      (snap) => {
        setData(snap.exists() ? ({ id: snap.id, ...snap.data() } as T) : null);
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [path]);
  return { data, loading };
}
