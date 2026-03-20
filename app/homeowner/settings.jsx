import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { ScrollView, Text, TouchableOpacity, View, Switch, Alert, ActivityIndicator, Image } from "react-native";
import { useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { signOut } from "firebase/auth";
import { db, auth } from "../../lib/firebase"; 
import { doc, onSnapshot, updateDoc, setDoc, getDoc } from "firebase/firestore";

export default function HomeownerSettings() {
  const router = useRouter();
  const user = auth.currentUser;
  const userEmail = user?.email;

  // States
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState({ fullName: "", faceReference: null });
  const [settings, setSettings] = useState({
    isFaceEnabled: true,
    isWeaponAlertEnabled: true,
    emailAlerts: true,
    smsAlerts: false,
  });

  useEffect(() => {
    if (!userEmail) return;

    // 1. Listen to Profile Data (from 'users' collection)
    const userRef = doc(db, "users", userEmail);
    const unsubUser = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) {
        setUserData(docSnap.data());
      }
    });

    // 2. Listen to Settings (from 'settings' collection)
    const settingsRef = doc(db, "settings", userEmail);
    const unsubSettings = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) {
        setSettings(docSnap.data());
      } else {
        setDoc(settingsRef, settings);
      }
      setLoading(false);
    });

    return () => {
      unsubUser();
      unsubSettings();
    };
  }, [userEmail]);

  const toggleSetting = async (key, value) => {
    try {
      const settingsRef = doc(db, "settings", userEmail);
      await updateDoc(settingsRef, { [key]: value });
    } catch (error) {
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
            router.replace("/login");
          } catch (error) {
            Alert.alert("Error", "Could not sign out.");
          }
        },
      },
    ]);
  };

  const SettingItem = ({ icon, title, subtitle, toggleKey, value, color = "#0891B2", isLast }) => (
    <View className={`flex-row items-center justify-between py-5 ${!isLast ? 'border-b border-gray-50' : ''}`}>
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
        value={value}
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
          
          {/* Profile Section - Pulls faceReference from 'users' collection */}
          <View className="bg-white rounded-[35px] p-6 shadow-xl shadow-cyan-900/5 border border-white mb-8 items-center flex-row">
            <View className="w-16 h-16 rounded-full bg-cyan-600 items-center justify-center mr-4 shadow-lg shadow-cyan-500/50 overflow-hidden border-2 border-white">
               {userData.faceReference ? (
                 <Image 
                   source={{ uri: userData.faceReference }} 
                   className="w-16 h-16"
                   resizeMode="cover"
                 />
               ) : (
                 <Text className="text-white text-2xl font-black">
                   {userData.fullName ? userData.fullName.charAt(0).toUpperCase() : userEmail?.charAt(0).toUpperCase()}
                 </Text>
               )}
            </View>
            <View>
              <Text className="text-xl font-black text-slate-800">
                {userData.fullName || "Home Owner"}
              </Text>
              <Text className="text-slate-400 text-xs font-medium">{userEmail}</Text>
            </View>
          </View>

          {/* AI Security Engine */}
          <Text className="text-cyan-800 font-bold mb-3 ml-2 uppercase tracking-widest text-[10px]">AI Security Engine</Text>
          <View className="bg-white rounded-[30px] px-6 shadow-lg shadow-cyan-900/5 border border-white mb-8">
            <SettingItem 
              icon="scan-outline" 
              title="Face ID Recognition" 
              subtitle="Identify trusted visitors automatically"
              toggleKey="isFaceEnabled"
              value={settings.isFaceEnabled}
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

          {/* Communication Channels */}
          <Text className="text-cyan-800 font-bold mb-3 ml-2 uppercase tracking-widest text-[10px]">Instant Notifications</Text>
          <View className="bg-white rounded-[30px] px-6 shadow-lg shadow-cyan-900/5 border border-white mb-8">
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

          {/* Info Banner */}
          <View className="bg-cyan-900 rounded-[25px] p-5 mb-8 flex-row items-center">
            <Ionicons name="shield-half-outline" size={24} color="#22D3EE" />
            <Text className="text-white text-[10px] font-bold ml-3 flex-1">
              Changes update your AI Surveillance station immediately.
            </Text>
          </View>

          {/* Logout */}
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