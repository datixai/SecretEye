import AsyncStorage from "@react-native-async-storage/async-storage";
import { Stack, useRouter, useSegments } from "expo-router";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import "../global.css";
import { auth, db } from "../lib/firebase";

export default function RootLayout() {
  const segments = useSegments();
  const router   = useRouter();
  const [isReady, setIsReady] = useState(false);

  const hasCheckedPersistenceRef = useRef(false);
  const isReadyRef               = useRef(false);

  // Keep latest segments in a ref so the single listener always reads the
  // current route without needing segments in the dependency array.
  const segmentsRef = useRef(segments);
  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  useEffect(() => {
    // Register listener ONCE (empty deps).
    // Previously [segments, hasCheckedPersistence] caused re-registration on
    // every navigation — Firebase immediately fired the new listener with the
    // current user, triggering repeated role-checks and redirect loops.
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      const currentSegments = segmentsRef.current;

      const inAuthGroup =
        currentSegments[0] === "(auth)"  ||
        currentSegments[0] === "login"   ||
        currentSegments[0] === "signup"  ||
        currentSegments[0] === undefined;

      if (user) {
        // ── "Remember Me" persistence check — runs ONCE per app session ──
        if (!hasCheckedPersistenceRef.current) {
          hasCheckedPersistenceRef.current = true;

          // KEY FIX: check for the "justLoggedIn" flag set by login.jsx.
          //
          // The rememberMe check is ONLY meant for cold-start auto-logins
          // (i.e. Firebase restored a saved session from AsyncStorage).
          // But onAuthStateChanged fires for BOTH:
          //   (a) cold-start auto-login   → should enforce rememberMe
          //   (b) fresh login just now    → should NOT sign user out
          //
          // login.jsx writes "justLoggedIn=true" right before signIn.
          // If that flag is present, this is case (b) — skip the check.
          // If the flag is absent, this is case (a) — enforce rememberMe.
          const justLoggedIn = await AsyncStorage.getItem("justLoggedIn");

          if (justLoggedIn === "true") {
            // User just logged in manually — clear the flag and proceed normally
            await AsyncStorage.removeItem("justLoggedIn");
          } else {
            // Cold-start auto-login — enforce "Remember Me" preference
            const rememberMe = await AsyncStorage.getItem("rememberMe");
            if (rememberMe === "false") {
              await signOut(auth);
              return; // onAuthStateChanged will fire again with null
            }
          }
        }

        // ── Role-based routing (only when on an auth screen) ──
        if (inAuthGroup) {
          try {
            const snap = await getDoc(doc(db, "users", user.uid));
            if (snap.exists()) {
              const role = snap.data().role;
              router.replace(role === "admin" ? "/admin/dashboard" : "/homeowner/dashboard");
            } else {
              router.replace("/homeowner/dashboard");
            }
          } catch (error) {
            console.error("Layout Role Fetch Error:", error);
            router.replace("/login");
          }
        }

      } else {
        // ── Not logged in — protect all non-auth screens ──
        if (!inAuthGroup) {
          router.replace("/login");
        }
      }

      // Reveal UI once — use ref to guard against stale closure calling
      // setIsReady(true) on every subsequent auth state change.
      if (!isReadyRef.current) {
        isReadyRef.current = true;
        setIsReady(true);
      }
    });

    return unsubscribe;
  }, []);

  if (!isReady) return null;

  return <Stack screenOptions={{ headerShown: false }} />;
}