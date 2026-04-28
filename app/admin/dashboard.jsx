import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import DashboardCard from "../../components/DashboardCard";
import HomeFooter from "../../components/HomeFooter";
import { db } from "../../lib/firebase";

export default function AdminDashboard() {
  const router = useRouter();

  // FIX: fetch real unread alert count from Firestore instead of hardcoding "3"
  const [unreadAlerts, setUnreadAlerts] = useState(0);

  useEffect(() => {
    const q = query(
      collection(db, "emergency_alerts"),
      where("status", "==", "UNREAD")
    );
    const unsub = onSnapshot(q, (snap) => {
      setUnreadAlerts(snap.size);
    }, (err) => {
      console.error("Admin dashboard alert count error:", err);
    });
    return () => unsub();
  }, []);

  return (
    <LinearGradient
      colors={["#F0F9FF", "#E0F2FE", "#BAE6FD", "#7DD3FC"]}
      style={{ flex: 1 }}
    >
      <ScrollView
        className="px-6 pt-16"
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="mb-8 pt-10">
          <View className="px-6 py-6 bg-white rounded-3xl shadow-xl border border-gray-200">
            <Text className="text-4xl font-extrabold text-cyan-800 tracking-wide">
              SecretEye
            </Text>
            <Text className="text-2xl font-bold text-gray-900 mt-2">
              Admin Dashboard
            </Text>
            <Text className="mt-3 text-gray-700 text-base font-medium">
              Monitor and manage the system efficiently
            </Text>
          </View>
        </View>

        {/* Settings Button */}
        <TouchableOpacity
          className="absolute top-16 right-6 p-3 rounded-full bg-white shadow-xl border border-gray-200"
          onPress={() => router.push("/admin/settings")}
          activeOpacity={0.8}
        >
          <Ionicons name="settings-outline" size={26} color="#0C4A6E" />
        </TouchableOpacity>

        {/* Status Tags — FIX: alert count is now live from Firestore */}
        <View className="flex-row gap-3 mb-8">
          <View className="px-4 py-2 rounded-full bg-cyan-500 shadow-lg">
            <Text className="text-white text-sm font-bold tracking-wide">
              🔒 System Armed
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push("/admin/panic")}
            className="px-4 py-2 rounded-full bg-red-500 shadow-lg"
          >
            <Text className="text-white text-sm font-bold tracking-wide">
              🚨 {unreadAlerts > 0 ? `${unreadAlerts} New Alert${unreadAlerts !== 1 ? "s" : ""}` : "No Alerts"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Dashboard Cards */}
        <DashboardCard
          icon={
            <View className="p-4 rounded-2xl bg-cyan-500 shadow-lg">
              <Ionicons name="shield-checkmark-outline" size={28} color="white" />
            </View>
          }
          title="System Control"
          subtitle="Arm / Disarm & Monitor Zones"
          onPress={() => router.push("/admin/system-control")}
        />

        <DashboardCard
          icon={
            <View className="p-4 rounded-2xl bg-blue-500 shadow-lg">
              <Ionicons name="people-outline" size={28} color="white" />
            </View>
          }
          title="Manage Users"
          subtitle="View & manage all homeowners"
          onPress={() => router.push("/admin/manageUsers")}
        />

        <DashboardCard
          icon={
            <View className="p-4 rounded-2xl bg-yellow-500 shadow-lg">
              <Ionicons name="notifications-outline" size={28} color="white" />
            </View>
          }
          title="Reports & Alerts"
          subtitle={unreadAlerts > 0 ? `${unreadAlerts} unread alert${unreadAlerts !== 1 ? "s" : ""}` : "No new alerts"}
          onPress={() => router.push("/admin/reports-and-alerts")}
        />

      </ScrollView>

      <View className="absolute bottom-0 left-0 right-0">
        <HomeFooter active="Home" />
      </View>
    </LinearGradient>
  );
}