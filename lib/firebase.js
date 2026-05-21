import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp } from "firebase/app";
import {
  browserSessionPersistence,
  getReactNativePersistence,
  initializeAuth,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { Platform } from "react-native";

// Hardcoded config — keep this file in .gitignore, never push to GitHub.
const firebaseConfig = {
  apiKey:            "AIzaSyA0LMfCi29FPTR6Nb_572htJqs0ADy-GNI",
  authDomain:        "secreteye-6896d.firebaseapp.com",
  projectId:         "secreteye-6896d",
  storageBucket:     "secreteye-6896d.firebasestorage.app",
  messagingSenderId: "609137103742",
  appId:             "1:609137103742:web:e9a09a7c57b2c260f4192f",
  measurementId:     "G-VNYR0QB40R",
};

const app = initializeApp(firebaseConfig);

// WEB  (npx expo start — laptop browser):
//   OLD: getAuth(app) → uses browserLocalStorage by default.
//   After signOut(), Firebase immediately reads localStorage, finds a valid
//   token, and fires onAuthStateChanged with the user again — making signout
//   appear completely broken (signs out and back in within milliseconds).
//
//   FIX: browserSessionPersistence — session lives only for the browser tab.
//   signOut() clears it immediately. Nothing restores it. Closing the tab
//   also clears it. This is correct for a surveillance control panel.
//
// NATIVE (phone / Expo Go):
//   getReactNativePersistence(AsyncStorage) — persists across app restarts.
//   Combined with the "Remember Me" flag in _layout.jsx, the user only
//   stays logged in if they ticked "Remember Me" on the login screen.

export const auth = initializeAuth(app, {
  persistence:
    Platform.OS === "web"
      ? browserSessionPersistence
      : getReactNativePersistence(AsyncStorage),
});

export const db      = getFirestore(app);
export const storage = getStorage(app);