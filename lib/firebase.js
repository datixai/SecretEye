import { initializeApp } from "firebase/app";
import { 
  getAuth,
  initializeAuth, 
  getReactNativePersistence 
} from "firebase/auth"; 
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native"; // <-- Added this to check PC vs Mobile

const firebaseConfig = {
  apiKey: "AIzaSyA0LMfCi29FPTR6Nb_572htJqs0ADy-GNI",
  authDomain: "secreteye-6896d.firebaseapp.com",
  projectId: "secreteye-6896d",
  storageBucket: "secreteye-6896d.firebasestorage.app",
  messagingSenderId: "609137103742",
  appId: "1:609137103742:web:e9a09a7c57b2c260f4192f",
  measurementId: "G-VNYR0QB40R"
};

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// --- HYBRID AUTH LOGIC ---
// This prevents the "(0 , _firebaseAuth.getReactNativePersistence) is not a function" error on PC
export const auth = Platform.OS === 'web' 
  ? getAuth(app) 
  : initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage)
    });

export const db = getFirestore(app);
export const storage = getStorage(app);