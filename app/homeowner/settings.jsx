import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { sendPasswordResetEmail, signOut } from "firebase/auth";
import { doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, Image, ScrollView,
  Switch, Text, TouchableOpacity, View,
} from "react-native";
import HomeFooter from "../../components/HomeFooter";
import { auth, db } from "../../lib/firebase";

export default function HomeownerSettings() {
  const router = useRouter();

  const [loading,  setLoading]  = useState(true);
  const [userData, setUserData] = useState({ fullName: "", faceReference: null });
  const [settings, setSettings] = useState({
    isFaceEnabled:        true,
    isWeaponAlertEnabled: true,
    emailAlerts:          true,
    smsAlerts:            false,
  });

  useEffect(() => {
    // Read currentUser inside the effect — never at render time
    const user = auth.currentUser;
    if (!user?.uid) { setLoading(false); return; }

    const unsubUser = onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (snap.exists()) setUserData(snap.data());
    });

    const unsubSettings = onSnapshot(doc(db, "settings", user.uid), (snap) => {
      if (snap.exists()) {
        setSettings(snap.data());
      } else {
        setDoc(doc(db, "settings", user.uid), {
          isFaceEnabled:        true,
          isWeaponAlertEnabled: true,
          emailAlerts:          true,
          smsAlerts:            false,
        });
      }
      setLoading(false);
    });

    return () => { unsubUser(); unsubSettings(); };
  }, []);

  const toggleSetting = async (key, value) => {
    const user = auth.currentUser;
    if (!user?.uid) return;
    try {
      await updateDoc(doc(db, "settings", user.uid), { [key]: value });
    } catch {
      Alert.alert("Sync Error", "Could not save preference.");
    }
  };

  const handlePasswordReset = () => {
    const email = userData?.email || auth.currentUser?.email;
    if (!email) return;
    Alert.alert("Reset Password", "Send a password reset link to your email?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Send Email",
        onPress: async () => {
          try {
            await sendPasswordResetEmail(auth, email);
            Alert.alert("Success", "Reset link sent to your inbox.");
          } catch (error) {
            Alert.alert("Error", error.message);
          }
        },
      },
    ]);
  };

  // ── Logout — IDENTICAL to admin/settings.jsx handleLogout ────────────────
  // The previous version used unsubscribeRef to cancel Firestore listeners
  // before signOut. This was over-engineered — onSnapshot permission errors
  // after signOut do NOT propagate into this try/catch, so the simple approach
  // (same as admin which works) is sufficient and more reliable.
  const handleLogout = async () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          try {
            await AsyncStorage.removeItem("rememberMe");
            await signOut(auth);
            // No router.replace — _layout.jsx onAuthStateChanged fires when
            // auth becomes null and redirects to /login automatically
          } catch (error) {
            console.error("Homeowner signOut error:", error);
            Alert.alert("Sign Out Failed", error.message);
          }
        },
      },
    ]);
  };

  const getFaceUri = (ref) => {
    if (!ref) return null;
    if (ref.startsWith("data:")) return ref;
    return `data:image/jpeg;base64,${ref}`;
  };

  const faceUri   = getFaceUri(userData.faceReference);
  const userEmail = userData?.email || auth.currentUser?.email;

  const SettingItem = ({ icon, title, subtitle, toggleKey, value, color = "#0891B2", isLast }) => (
    <View className={`flex-row items-center justify-between py-5 ${!isLast ? "border-b border-gray-100" : ""}`}>
      <View className="flex-row items-center flex-1">
        <View className="w-14 h-14 rounded-2xl flex items-center justify-center mr-4 shadow-sm" style={{ backgroundColor: color }}>
          <Ionicons name={icon} size={26} color="white" />
        </View>
        <View className="flex-1">
          <Text className="font-bold text-gray-800 text-base">{title}</Text>
          <Text className="text-gray-500 text-sm">{subtitle}</Text>
        </View>
      </View>
      <Switch
        trackColor={{ false: "#CBD5E1", true: color }}
        thumbColor="#fff"
        onValueChange={(val) => toggleSetting(toggleKey, val)}
        value={!!value}
      />
    </View>
  );

  if (loading) return (
    <View className="flex-1 justify-center items-center bg-sky-50">
      <ActivityIndicator size="large" color="#0EA5E9" />
    </View>
  );

  return (
    <LinearGradient colors={["#F0F9FF", "#E0F2FE", "#BAE6FD", "#7DD3FC"]} style={{ flex: 1 }}>
      <ScrollView
        className="px-6 pt-16"
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header — same as admin */}
        <View className="flex-row items-center justify-between mb-8 pt-10">
          <TouchableOpacity
            onPress={() => router.back()}
            className="p-3 rounded-full bg-white shadow-xl border border-gray-200"
          >
            <Ionicons name="arrow-back" size={22} color="#0C4A6E" />
          </TouchableOpacity>
          <Text className="text-2xl font-bold text-gray-800 tracking-wide">Security Settings</Text>
          <View className="w-10" />
        </View>

        {/* Profile Card — same style as admin */}
        <View className="bg-white rounded-[32px] p-6 mb-6 shadow-2xl border border-white/50 flex-row items-center">
          <View className="w-20 h-20 rounded-2xl bg-slate-100 overflow-hidden shadow-md border-2 border-cyan-400">
            {faceUri ? (
              <Image source={{ uri: faceUri }} className="w-full h-full" resizeMode="cover" />
            ) : (
              <View className="w-full h-full items-center justify-center bg-cyan-500">
                <Ionicons name="person" size={40} color="white" />
              </View>
            )}
          </View>
          <View className="ml-5 flex-1">
            <Text className="text-gray-900 font-black text-xl">{userData.fullName || "Home Owner"}</Text>
            <Text className="text-cyan-600 font-bold text-xs uppercase tracking-widest">homeowner</Text>
            <Text className="text-gray-500 text-xs mt-1">{userEmail}</Text>
          </View>
        </View>

        {/* AI Engine section */}
        <Text className="text-gray-500 font-bold text-[10px] uppercase tracking-widest ml-2 mb-4">
          AI Security Engine
        </Text>
        <View className="bg-white rounded-3xl px-6 mb-4 shadow-xl border border-gray-200">
          <SettingItem
            icon="scan-outline"
            title="Face ID Recognition"
            subtitle="Identify trusted visitors automatically"
            toggleKey="isFaceEnabled"
            value={settings.isFaceEnabled}
            color="#0891B2"
          />
          <SettingItem
            icon="warning-outline"
            title="Weapon Detection"
            subtitle="Real-time alerts for dangerous objects"
            toggleKey="isWeaponAlertEnabled"
            value={settings.isWeaponAlertEnabled}
            color="#EF4444"
            isLast
          />
        </View>

        {/* Notifications section */}
        <Text className="text-gray-500 font-bold text-[10px] uppercase tracking-widest ml-2 mb-4 mt-6">
          Notifications
        </Text>
        <View className="bg-white rounded-3xl px-6 mb-4 shadow-xl border border-gray-200">
          <SettingItem
            icon="mail-outline"
            title="Email Reports"
            subtitle="Get security logs via email"
            toggleKey="emailAlerts"
            value={settings.emailAlerts}
            color="#F59E0B"
          />
          <SettingItem
            icon="logo-whatsapp"
            title="WhatsApp Alerts"
            subtitle="Critical threats via WhatsApp"
            toggleKey="smsAlerts"
            value={settings.smsAlerts}
            color="#25D366"
            isLast
          />
        </View>

        {/* Account section — same as admin */}
        <Text className="text-gray-500 font-bold text-[10px] uppercase tracking-widest ml-2 mb-4 mt-6">
          Account
        </Text>

        {/* Change Password — same card style as admin */}
        <TouchableOpacity
          onPress={handlePasswordReset}
          className="bg-white rounded-3xl p-6 mb-4 shadow-xl border border-gray-200 flex-row items-center justify-between"
        >
          <View className="flex-row items-center flex-1">
            <View className="w-14 h-14 bg-purple-500 rounded-2xl flex items-center justify-center mr-4 shadow-lg">
              <Ionicons name="lock-closed-outline" size={26} color="white" />
            </View>
            <View className="flex-1">
              <Text className="font-bold text-gray-800 text-lg">Change Password</Text>
              <Text className="text-gray-500 text-sm">Send reset link to email</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#9CA3AF" />
        </TouchableOpacity>

        {/* Support — same card style as admin */}
        <TouchableOpacity className="bg-white rounded-3xl p-6 mb-10 shadow-xl border border-gray-200 flex-row items-center justify-between">
          <View className="flex-row items-center flex-1">
            <View className="w-14 h-14 bg-cyan-400 rounded-2xl flex items-center justify-center mr-4 shadow-lg">
              <Ionicons name="help-circle-outline" size={26} color="white" />
            </View>
            <View className="flex-1">
              <Text className="font-bold text-gray-800 text-lg">Support</Text>
              <Text className="text-gray-500 text-sm">Help & documentation</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#9CA3AF" />
        </TouchableOpacity>

        {/* Sign Out — IDENTICAL button to admin "Terminate Session" */}
        <TouchableOpacity
          className="bg-red-500 rounded-[24px] py-5 items-center shadow-xl border-b-4 border-red-700"
          onPress={handleLogout}
        >
          <View className="flex-row items-center">
            <Ionicons name="log-out-outline" size={22} color="white" />
            <Text className="text-white font-black text-lg ml-2 uppercase">Sign Out</Text>
          </View>
        </TouchableOpacity>

      </ScrollView>

      <View className="absolute bottom-0 left-0 right-0">
        <HomeFooter active="Settings" role="homeowner" />
      </View>
    </LinearGradient>
  );
}