import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { signOut } from "firebase/auth";
import { doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, ScrollView, Switch, Text, TouchableOpacity, View } from "react-native";
import { auth, db } from "../../lib/firebase";

export default function HomeownerSettings() {
  const router = useRouter();
  const user = auth.currentUser;
  const userEmail = user?.email;

  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState({ fullName: "", faceReference: null });
  const [settings, setSettings] = useState({
    isFaceEnabled: true,
    isWeaponAlertEnabled: true,
    emailAlerts: true,
    smsAlerts: false,
  });

  useEffect(() => {
    // FIX: use uid as doc ID — signup.jsx writes doc(db, "users", uid)
    if (!user?.uid) return;

    const userRef = doc(db, "users", user.uid);
    const unsubUser = onSnapshot(userRef, (snap) => {
      if (snap.exists()) setUserData(snap.data());
    });

    const settingsRef = doc(db, "settings", user.uid);
    const unsubSettings = onSnapshot(settingsRef, (snap) => {
      if (snap.exists()) {
        setSettings(snap.data());
      } else {
        setDoc(settingsRef, {
          isFaceEnabled: true,
          isWeaponAlertEnabled: true,
          emailAlerts: true,
          smsAlerts: false,
        });
      }
      setLoading(false);
    });

    return () => { unsubUser(); unsubSettings(); };
  }, [user?.uid]);

  const toggleSetting = async (key, value) => {
    try {
      await updateDoc(doc(db, "settings", user.uid), { [key]: value });
    } catch {
      Alert.alert("Sync Error", "Could not save preference.");
    }
  };

  const handleSignOut = async () => {
    Alert.alert("Sign Out", "Log out of your account?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log Out",
        style: "destructive",
        onPress: async () => {
          try {
            await AsyncStorage.removeItem("rememberMe");
            await signOut(auth);
            // FIX: removed router.replace("/login") — _layout.jsx onAuthStateChanged
            // fires automatically when auth becomes null and handles the redirect.
            // Having both causes a navigation crash in Expo Router.
          } catch {
            Alert.alert("Error", "Could not sign out.");
          }
        },
      },
    ]);
  };

  // FIX: faceReference is stored as raw base64 — needs data URI prefix
  const getFaceUri = (ref) => {
    if (!ref) return null;
    if (ref.startsWith("data:")) return ref;
    return `data:image/jpeg;base64,${ref}`;
  };
  const faceUri = getFaceUri(userData.faceReference);

  const SettingItem = ({ icon, title, subtitle, toggleKey, value, color = "#0891B2", isLast }) => (
    <View className={`flex-row items-center justify-between py-5 ${!isLast ? "border-b border-gray-50" : ""}`}>
      <View className="flex-row items-center flex-1">
        <View className="p-3 rounded-2xl mr-4" style={{ backgroundColor: `${color}15` }}>
          <Ionicons name={icon} size={22} color={color} />
        </View>
        <View className="flex-1">
          <Text className="text-gray-900 font-bold text-base">{title}</Text>
          <Text className="text-gray-500 text-[10px] mt-0.5">{subtitle}</Text>
        </View>
      </View>
      <Switch
        trackColor={{ false: "#CBD5E1", true: color }}
        thumbColor={"#fff"}
        onValueChange={(val) => toggleSetting(toggleKey, val)}
        value={!!value}
      />
    </View>
  );

  if (loading) return (
    <View className="flex-1 justify-center items-center bg-white">
      <ActivityIndicator size="large" color="#0891B2" />
    </View>
  );

  return (
    <LinearGradient colors={["#F0F9FF", "#E0F2FE", "#FFFFFF"]} style={{ flex: 1 }}>
      <View className="flex-1 px-6 pt-16">

        {/* Header */}
        <View className="flex-row items-center justify-between mb-8">
          <TouchableOpacity onPress={() => router.back()} className="p-3 rounded-2xl bg-white shadow-sm border border-gray-100">
            <Ionicons name="arrow-back" size={22} color="#0C4A6E" />
          </TouchableOpacity>
          <Text className="text-xl font-extrabold text-cyan-900">Security Settings</Text>
          <View className="w-12" />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

          {/* Profile */}
          <View className="bg-white rounded-[35px] p-6 shadow-xl border border-white mb-8 items-center flex-row">
            <View className="w-16 h-16 rounded-full bg-cyan-600 items-center justify-center mr-4 overflow-hidden border-2 border-white">
              {faceUri ? (
                <Image source={{ uri: faceUri }} style={{ width: 64, height: 64 }} resizeMode="cover" />
              ) : (
                <Text className="text-white text-2xl font-black">
                  {userData.fullName ? userData.fullName.charAt(0).toUpperCase() : userEmail?.charAt(0).toUpperCase()}
                </Text>
              )}
            </View>
            <View>
              <Text className="text-xl font-black text-slate-800">{userData.fullName || "Home Owner"}</Text>
              <Text className="text-slate-400 text-xs font-medium">{userEmail}</Text>
            </View>
          </View>

          {/* AI Engine */}
          <Text className="text-cyan-800 font-bold mb-3 ml-2 uppercase tracking-widest text-[10px]">AI Security Engine</Text>
          <View className="bg-white rounded-[30px] px-6 shadow-lg border border-white mb-8">
            <SettingItem icon="scan-outline" title="Face ID Recognition" subtitle="Identify trusted visitors automatically" toggleKey="isFaceEnabled" value={settings.isFaceEnabled} />
            <SettingItem icon="warning-outline" title="Weapon Detection" subtitle="Real-time alerts for dangerous objects" toggleKey="isWeaponAlertEnabled" value={settings.isWeaponAlertEnabled} color="#EF4444" isLast />
          </View>

          {/* Notifications */}
          <Text className="text-cyan-800 font-bold mb-3 ml-2 uppercase tracking-widest text-[10px]">Instant Notifications</Text>
          <View className="bg-white rounded-[30px] px-6 shadow-lg border border-white mb-8">
            <SettingItem icon="mail-outline" title="Email Reports" subtitle="Get security logs via email" toggleKey="emailAlerts" value={settings.emailAlerts} color="#F59E0B" />
            <SettingItem icon="logo-whatsapp" title="WhatsApp Alerts" subtitle="Critical threats via WhatsApp" toggleKey="smsAlerts" value={settings.smsAlerts} color="#25D366" isLast />
          </View>

          {/* Info banner */}
          <View className="bg-cyan-900 rounded-[25px] p-5 mb-8 flex-row items-center">
            <Ionicons name="shield-half-outline" size={24} color="#22D3EE" />
            <Text className="text-white text-[10px] font-bold ml-3 flex-1">
              Changes update your AI Surveillance station immediately.
            </Text>
          </View>

          {/* Sign out */}
          <TouchableOpacity
            onPress={handleSignOut}
            className="flex-row items-center justify-center bg-red-50 py-5 rounded-[25px] border border-red-100 mb-10"
          >
            <Ionicons name="log-out-outline" size={22} color="#EF4444" />
            <Text className="text-red-500 font-black text-base ml-2">Sign Out System</Text>
          </TouchableOpacity>

        </ScrollView>
      </View>
    </LinearGradient>
  );
}