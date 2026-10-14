import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, onSnapshot, serverTimestamp, setDoc, type Unsubscribe } from "firebase/firestore";
import { create } from "zustand";
import { auth, db } from "@/lib/firebase";
import type { UserProfile } from "@/lib/types";

type Status = "loading" | "signedOut" | "ready" | "blocked";

interface SessionState {
  status: Status;
  user: User | null;
  profile: UserProfile | null;
  blockedReason: "admin" | "disabled" | null;
  /** Set while signup is writing the profile doc, so we don't create a blank one. */
  signingUp: boolean;
}

export const useSession = create<SessionState>(() => ({
  status: "loading",
  user: null,
  profile: null,
  blockedReason: null,
  signingUp: false,
}));

let profileUnsub: Unsubscribe | null = null;
let started = false;

export function startSessionListener() {
  if (started) return;
  started = true;
  onAuthStateChanged(auth, (user) => {
    profileUnsub?.();
    profileUnsub = null;
    if (!user) {
      useSession.setState({ status: "signedOut", user: null, profile: null, blockedReason: null });
      return;
    }
    useSession.setState({ user, status: "loading" });
    profileUnsub = onSnapshot(
      doc(db, "users", user.uid),
      (snap) => {
        if (!snap.exists()) {
          if (useSession.getState().signingUp) return;
          // Account exists in Auth but has no profile (older account) — create a minimal one.
          void setDoc(doc(db, "users", user.uid), {
            uid: user.uid,
            email: user.email ?? "",
            fullName: user.displayName ?? (user.email ?? "").split("@")[0],
            role: "homeowner",
            createdAt: serverTimestamp(),
          });
          return;
        }
        const profile = { uid: user.uid, ...snap.data() } as UserProfile;
        if (profile.disabled) {
          useSession.setState({ profile, status: "blocked", blockedReason: "disabled" });
        } else if (profile.role === "admin") {
          useSession.setState({ profile, status: "blocked", blockedReason: "admin" });
        } else {
          useSession.setState({ profile, status: "ready", blockedReason: null });
        }
      },
      () => useSession.setState({ status: "ready" }),
    );
  });
}

/** Current user's uid; screens under (app) are only mounted when signed in. */
export function useUid(): string {
  return useSession((s) => s.user?.uid ?? "");
}
