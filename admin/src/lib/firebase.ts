import { initializeApp } from "firebase/app";
import { browserLocalPersistence, initializeAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const env = import.meta.env;

export const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
});

export const auth = initializeAuth(app, { persistence: browserLocalPersistence });
export const db = getFirestore(app);

export const BACKEND_URL: string = env.VITE_BACKEND_URL || "http://localhost:5000";
