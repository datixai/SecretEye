import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { auth, db } from "./firebase";
import type { UserProfile } from "./types";

type State =
  | { status: "loading" }
  | { status: "signedOut"; reason?: "not-admin" | "disabled" }
  | { status: "admin"; user: User; profile: UserProfile };

const Ctx = createContext<State>({ status: "loading" });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let unsubProfile: (() => void) | undefined;
    const unsub = onAuthStateChanged(auth, (user) => {
      unsubProfile?.();
      if (!user) {
        setState((s) => (s.status === "signedOut" ? s : { status: "signedOut" }));
        return;
      }
      setState({ status: "loading" });
      unsubProfile = onSnapshot(
        doc(db, "users", user.uid),
        (snap) => {
          const profile = snap.exists() ? ({ uid: user.uid, ...snap.data() } as UserProfile) : null;
          if (!profile || profile.role !== "admin" || profile.disabled) {
            // Homeowners can't use the admin site.
            setState({ status: "signedOut", reason: profile?.disabled ? "disabled" : "not-admin" });
            void signOut(auth);
            return;
          }
          setState({ status: "admin", user, profile });
        },
        () => {
          setState({ status: "signedOut", reason: "not-admin" });
          void signOut(auth);
        },
      );
    });
    return () => {
      unsub();
      unsubProfile?.();
    };
  }, []);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

export function useAdmin() {
  const s = useContext(Ctx);
  if (s.status !== "admin") throw new Error("useAdmin outside admin area");
  return s;
}
