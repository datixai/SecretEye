import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { sendPasswordResetEmail, signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, Image, ScrollView,
  Text, TouchableOpacity, View,
} from "react-native";
import HomeFooter from "../../components/HomeFooter";
import { auth, db } from "../../lib/firebase";

export default function AdminSettings() {
  const router = useRouter();
  const [adminData, setAdminData] = useState(null);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const unsubscribe = onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (snap.exists()) setAdminData(snap.data());
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handlePasswordReset = () => {
    const email = adminData?.email;
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

  // This is the working logout — simple and reliable
  const handleLogout = async () => {
    Alert.alert("Logout", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          try {
            await AsyncStorage.removeItem("rememberMe");
            await signOut(auth);
            // No router.replace — _layout.jsx onAuthStateChanged handles redirect
          } catch (error) {
            console.error("Admin logout error:", error);
            Alert.alert("Logout Failed", error.message);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-sky-50">
        <ActivityIndicator size="large" color="#0EA5E9" />
      </View>
    );
  }

  return (
    <LinearGradient colors={["#F0F9FF", "#E0F2FE", "#BAE6FD", "#7DD3FC"]} style={{ flex: 1 }}>
      <ScrollView
        className="px-6 pt-16"
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="flex-row items-center justify-between mb-8 pt-10">
          <TouchableOpacity
            onPress={() => router.back()}
            className="p-3 rounded-full bg-white shadow-xl border border-gray-200"
          >
            <Ionicons name="arrow-back" size={22} color="#0C4A6E" />
          </TouchableOpacity>
          <Text className="text-2xl font-bold text-gray-800 tracking-wide">Admin Command</Text>
          <View className="w-10" />
        </View>

        {/* Profile Card */}
        <View className="bg-white rounded-[32px] p-6 mb-6 shadow-2xl border border-white/50 flex-row items-center">
          <View className="w-20 h-20 rounded-2xl bg-slate-100 overflow-hidden shadow-md border-2 border-cyan-400">
            {adminData?.profilePic ? (
              <Image source={{ uri: adminData.profilePic }} className="w-full h-full" resizeMode="cover" />
            ) : (
              <View className="w-full h-full items-center justify-center bg-cyan-500">
                <Ionicons name="person" size={40} color="white" />
              </View>
            )}
          </View>
          <View className="ml-5 flex-1">
            <Text className="text-gray-900 font-black text-xl">{adminData?.fullName || "System Admin"}</Text>
            <Text className="text-cyan-600 font-bold text-xs uppercase tracking-widest">{adminData?.role}</Text>
            <Text className="text-gray-500 text-xs mt-1">{adminData?.email}</Text>
          </View>
        </View>

        <Text className="text-gray-500 font-bold text-[10px] uppercase tracking-widest ml-2 mb-4">
          Security & Access
        </Text>

        {/* Change Password */}
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

        {/* Support */}
        <TouchableOpacity className="bg-white rounded-3xl p-6 mb-10 shadow-xl border border-gray-200 flex-row items-center justify-between">
          <View className="flex-row items-center flex-1">
            <View className="w-14 h-14 bg-cyan-400 rounded-2xl flex items-center justify-center mr-4 shadow-lg">
              <Ionicons name="help-circle-outline" size={26} color="white" />
            </View>
            <View className="flex-1">
              <Text className="font-bold text-gray-800 text-lg">System Support</Text>
              <Text className="text-gray-500 text-sm">Documentation & logs</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#9CA3AF" />
        </TouchableOpacity>

        {/* Logout — same button style as homeowner Sign Out */}
        <TouchableOpacity
          className="bg-red-500 rounded-[24px] py-5 items-center shadow-xl border-b-4 border-red-700"
          onPress={handleLogout}
        >
          <View className="flex-row items-center">
            <Ionicons name="log-out-outline" size={22} color="white" />
            <Text className="text-white font-black text-lg ml-2 uppercase">Terminate Session</Text>
          </View>
        </TouchableOpacity>

      </ScrollView>

      <View className="absolute bottom-0 left-0 right-0">
        <HomeFooter active="Settings" />
      </View>
    </LinearGradient>
  );
}