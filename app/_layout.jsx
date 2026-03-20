import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import "../global.css";

export default function RootLayout() {
  const segments = useSegments();
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  const [hasCheckedPersistence, setHasCheckedPersistence] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      // Define which routes are part of the login/auth flow
      const inAuthGroup = 
        segments[0] === "(auth)" || 
        segments[0] === "login" || 
        segments[0] === "signup" || 
        segments[0] === undefined;

      if (user) {
        // 1. Handle "Remember Me" logic for fresh app starts
        if (!hasCheckedPersistence) {
          const rememberMe = await AsyncStorage.getItem("rememberMe");
          setHasCheckedPersistence(true);

          if (rememberMe === "false") {
            // User opted out of being remembered; sign them out and exit
            await signOut(auth);
            return; 
          }
        }

        // 2. Role-Based Routing Logic
        // We only trigger a redirect if the user is currently stuck in the auth screens
        if (inAuthGroup) {
          try {
            const userRef = doc(db, "users", user.uid);
            const snap = await getDoc(userRef);
            
            if (snap.exists()) {
              const userData = snap.data();
              
              // Direct to specific dashboard based on Firestore 'role' field
              if (userData.role === "admin") {
                router.replace("/admin/dashboard");
              } else {
                router.replace("/homeowner/dashboard");
              }
            } else {
              // Safety fallback: if no Firestore doc exists, treat as standard user
              router.replace("/homeowner/dashboard");
            }
          } catch (error) {
            console.error("Layout Role Fetch Error:", error);
            router.replace("/login");
          }
        }
      } else {
        // 3. Not logged in: Redirect to login if they try to access protected folders
        if (!inAuthGroup) {
          router.replace("/login");
        }
      }
      
      // Reveal the UI once the path is determined
      setIsReady(true);
    });

    return unsubscribe;
  }, [segments, hasCheckedPersistence]);

  // Prevent flickering by showing nothing until auth state is resolved
  if (!isReady) return null; 

  return <Stack screenOptions={{ headerShown: false }} />;
}