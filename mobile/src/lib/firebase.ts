import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  // @ts-expect-error — exported by the React Native build of firebase/auth
  getReactNativePersistence,
  connectAuthEmulator,
  initializeAuth,
  type Auth,
} from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { Platform } from "react-native";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const isFirstInit = getApps().length === 0;
export const app = isFirstInit ? initializeApp(firebaseConfig) : getApp();

// Stay signed in across restarts (standard for a security app).
// initializeAuth may only run once; fast refresh re-evaluates this module.
export const auth: Auth = isFirstInit
  ? initializeAuth(app, {
      persistence:
        Platform.OS === "web"
          ? browserLocalPersistence
          : getReactNativePersistence(AsyncStorage),
    })
  : getAuth(app);

export const db = getFirestore(app);

// Local demo / testing: EXPO_PUBLIC_USE_EMULATORS=1 talks to the Firebase emulators instead of production.
if (process.env.EXPO_PUBLIC_USE_EMULATORS === "1" && isFirstInit) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}
