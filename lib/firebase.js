import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp } from "firebase/app";
import { getAuth, getReactNativePersistence, initializeAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { Platform } from "react-native";

// Hardcoded config — env vars were unreliable across devices.
// Keep this file in .gitignore so it never gets pushed to GitHub.
const firebaseConfig = {
  apiKey: "AIzaSyA0LMfCi29FPTR6Nb_572htJqs0ADy-GNI",
  authDomain: "secreteye-6896d.firebaseapp.com",
  projectId: "secreteye-6896d",
  storageBucket: "secreteye-6896d.firebasestorage.app",
  messagingSenderId: "609137103742",
  appId: "1:609137103742:web:e9a09a7c57b2c260f4192f",
  measurementId: "G-VNYR0QB40R",
};

const app = initializeApp(firebaseConfig);

// Hybrid auth: web uses getAuth (no persistence needed),
// native uses initializeAuth with AsyncStorage persistence.
// This prevents the "getReactNativePersistence is not a function" error on PC/web.
export const auth =
  Platform.OS === "web"
    ? getAuth(app)
    : initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
      });

export const db = getFirestore(app);
export const storage = getStorage(app);
