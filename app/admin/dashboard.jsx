import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DashboardCard from "../../components/DashboardCard";
import HomeFooter from "../../components/HomeFooter";

export default function AdminDashboard() {
  const router = useRouter();

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
        {/* Attractive Header */}
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

        {/* Status Tags */}
        <View className="flex-row gap-3 mb-8">
          <View className="px-4 py-2 rounded-full bg-cyan-500 shadow-lg">
            <Text className="text-white text-sm font-bold tracking-wide">
              🔒 System Armed
            </Text>
          </View>
          <View className="px-4 py-2 rounded-full bg-red-500 shadow-lg">
            <Text className="text-white text-sm font-bold tracking-wide">
              🚨 3 New Alerts
            </Text>
          </View>
        </View>

        {/* Dashboard Cards with colors and same size as HomeownerDashboard */}
        <DashboardCard
          icon={
            <View className="p-4 rounded-2xl bg-cyan-500 shadow-lg">
              <Ionicons
                name="shield-checkmark-outline"
                size={28}
                color="white"
              />
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
          subtitle="3 Homeowners, 5 Guests"
          onPress={() => router.push("/admin/manageUsers")}
        />

        <DashboardCard
          icon={
            <View className="p-4 rounded-2xl bg-yellow-500 shadow-lg">
              <Ionicons name="notifications-outline" size={28} color="white" />
            </View>
          }
          title="Reports & Alerts"
          subtitle="2 New Alerts"
          onPress={() => router.push("/admin/reports-and-alerts")}
        />
        
      </ScrollView>

      {/* Sticky Footer */}
      <View className="absolute bottom-0 left-0 right-0">
        <HomeFooter active="Home" />
      </View>
    </LinearGradient>
  );
}
