import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { ScrollView, Text, TouchableOpacity, View, Image } from "react-native";
import { useState, useEffect } from "react";
import { db, auth } from "../../lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import HomeFooter from "../../components/HomeFooter";
import HomeownerDBCard from "../../components/HomeownerDBCard";

const LogoImg = require("../../assets/logo.png");

export default function HomeownerDashboard() {
  const router = useRouter();

  // FIX: was auth.currentUser?.email — users collection doc IDs are UIDs (set in signup.jsx)
  const userId = auth.currentUser?.uid;

  const [userData, setUserData] = useState({ fullName: "Home Owner", faceReference: null });

  useEffect(() => {
    if (!userId) return;

    // FIX: was doc(db, "users", userEmail) — document ID is UID not email
    const userRef = doc(db, "users", userId);
    const unsubscribe = onSnapshot(userRef, (snap) => {
      if (snap.exists()) setUserData(snap.data());
    });
    return () => unsubscribe();
  }, [userId]);

  // FIX: signup.jsx stores faceReference as raw base64 (no prefix).
  // We safely prepend the data URI prefix only when needed.
  const getFaceUri = (ref) => {
    if (!ref) return null;
    if (ref.startsWith("data:")) return ref;
    return `data:image/jpeg;base64,${ref}`;
  };

  const faceUri = getFaceUri(userData.faceReference);

  return (
    <LinearGradient
      colors={["#F0F9FF", "#E0F2FE", "#BAE6FD", "#7DD3FC"]}
      style={{ flex: 1 }}
    >
      <ScrollView
        className="px-6"
        contentContainerStyle={{ paddingTop: 60, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ─────────────────────────────────── */}
        <View className="mb-8">
          <View className="flex-row items-center justify-between mb-6">

            {/* Logo + brand */}
            <View className="flex-row items-center">
              <View className="w-14 h-14 bg-white rounded-2xl items-center justify-center shadow-lg border border-cyan-50 overflow-hidden">
                <Image source={LogoImg} style={{ width: "100%", height: "100%" }} resizeMode="contain" />
              </View>
              <View className="ml-3">
                <Text className="text-3xl font-black text-cyan-900 tracking-tighter">
                  Secret<Text className="text-cyan-600">Eye</Text>
                </Text>
                <View className="flex-row items-center">
                  <View className="w-2 h-2 rounded-full bg-green-500 mr-1" />
                  <Text className="text-xs font-bold text-gray-500 uppercase tracking-widest">AI Active</Text>
                </View>
              </View>
            </View>

            {/* Profile avatar — tapping opens settings */}
            <TouchableOpacity
              onPress={() => router.push("/homeowner/settings")}
              activeOpacity={0.7}
              className="w-14 h-14 rounded-full border-2 border-white shadow-lg overflow-hidden bg-white items-center justify-center"
            >
              {faceUri ? (
                <Image source={{ uri: faceUri }} className="w-full h-full" resizeMode="cover" />
              ) : (
                <LinearGradient colors={["#0891B2", "#0E7490"]} className="w-full h-full items-center justify-center">
                  <Text className="text-white font-bold text-xl">
                    {userData.fullName?.charAt(0).toUpperCase()}
                  </Text>
                </LinearGradient>
              )}
            </TouchableOpacity>
          </View>

          {/* Welcome card */}
          <View className="bg-white/80 rounded-[35px] p-6 border border-white shadow-sm">
            <Text className="text-gray-500 text-sm font-medium">Welcome back,</Text>
            <Text className="text-2xl font-bold text-slate-900">{userData.fullName}</Text>
            <Text className="text-slate-500 text-xs mt-1 leading-4">
              Monitor and control your home security in real-time.{"\n"}
              Live AI protection is currently enabled.
            </Text>
          </View>
        </View>

        {/* ── Status tags ────────────────────────────── */}
        <View className="flex-row gap-3 mb-8">
          <View className="px-4 py-2 rounded-full bg-cyan-600 shadow-md">
            <Text className="text-white text-xs font-bold tracking-wide">🔒 System Armed</Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push("/homeowner/activity")}
            className="px-4 py-2 rounded-full bg-red-500 shadow-md"
          >
            <Text className="text-white text-xs font-bold tracking-wide">🚨 View Alerts</Text>
          </TouchableOpacity>
        </View>

        {/* ── Dashboard cards ────────────────────────── */}
        <HomeownerDBCard
          icon={<View className="p-4 rounded-2xl bg-cyan-500 shadow-lg"><Ionicons name="videocam-outline" size={28} color="white" /></View>}
          title="Surveillance Control"
          subtitle="Live Camera Feeds"
          onPress={() => router.push("/homeowner/surveillance")}
        />

        <HomeownerDBCard
          icon={<View className="p-4 rounded-2xl bg-green-500 shadow-lg"><Ionicons name="location-outline" size={28} color="white" /></View>}
          title="Manage Zones"
          subtitle="Security Zone Configuration"
          onPress={() => router.push("/homeowner/manage-zones")}
        />

        <HomeownerDBCard
          icon={<View className="p-4 rounded-2xl bg-blue-500 shadow-lg"><Ionicons name="people-outline" size={28} color="white" /></View>}
          title="Trusted Visitors"
          subtitle="Manage Face Whitelist"
          onPress={() => router.push("/homeowner/trusted-visitors")}
        />

        <HomeownerDBCard
          icon={<View className="p-4 rounded-2xl bg-yellow-500 shadow-lg"><Ionicons name="notifications-outline" size={28} color="white" /></View>}
          title="Reports & Alerts"
          subtitle="View Activity Logs"
          badge
          onPress={() => router.push("/homeowner/activity")}
        />

        <HomeownerDBCard
          icon={<View className="p-4 rounded-2xl bg-purple-500 shadow-lg"><Ionicons name="shield-checkmark-outline" size={28} color="white" /></View>}
          title="Evidence Review"
          subtitle="AI Detection Snapshots"
          onPress={() => router.push("/homeowner/evidence")}
        />
      </ScrollView>

      <View className="absolute bottom-0 left-0 right-0">
        <HomeFooter active="Home" />
      </View>
    </LinearGradient>
  );
}
