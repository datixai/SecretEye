import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useState } from "react";

export default function SurveillanceControl() {
  const [cameraActive, setCameraActive] = useState(true);
  const router = useRouter();

  const zones = [
    { id: "1", name: "Front Door", status: "motion" },
    { id: "2", name: "Driveway", status: "live" },
    { id: "3", name: "Backyard", status: "live" },
    { id: "4", name: "Garage", status: "inactive" },
  ];

  const getZoneUI = (status) => {
    switch (status) {
      case "motion":
        return {
          bg: "bg-red-100",
          iconBg: "bg-red-500",
          icon: "alert-circle-outline",
          label: "Motion Detected",
          text: "text-red-700",
        };
      case "live":
        return {
          bg: "bg-cyan-100",
          iconBg: "bg-cyan-500",
          icon: "videocam-outline",
          label: "Live Feed",
          text: "text-cyan-700",
        };
      default:
        return {
          bg: "bg-gray-100",
          iconBg: "bg-gray-400",
          icon: "videocam-off-outline",
          label: "Offline",
          text: "text-gray-600",
        };
    }
  };

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
        {/* Header Section */}
        <View className="flex-row items-center justify-between mb-8">
          <View>
            <Text className="text-4xl font-black text-cyan-900 tracking-tighter">
              Surveillance
            </Text>
            <Text className="text-cyan-700 font-medium">Real-time Node Control</Text>
          </View>
          <TouchableOpacity
            onPress={() => router.back()}
            className="p-3 rounded-2xl bg-white shadow-xl border border-gray-100"
          >
            <Ionicons name="arrow-back" size={26} color="#0C4A6E" />
          </TouchableOpacity>
        </View>

        {/* Status Tags */}
        <View className="flex-row gap-3 mb-8">
          <View className="px-4 py-2 rounded-full bg-cyan-600 shadow-md">
            <Text className="text-white text-xs font-bold tracking-wide">📹 4 Zones</Text>
          </View>
          <View className="px-4 py-2 rounded-full bg-green-500 shadow-md">
            <Text className="text-white text-xs font-bold tracking-wide">✅ 3 Online</Text>
          </View>
        </View>

        {/* Live Indicator Card */}
        <View className="bg-white/70 rounded-[30px] p-5 border border-white mb-8 flex-row items-center justify-between">
           <View className="flex-row items-center">
              <View className="w-3 h-3 rounded-full bg-green-500 mr-3 shadow-sm shadow-green-500" />
              <Text className="text-cyan-900 font-bold">AI NETWORK ACTIVE</Text>
           </View>
           <Ionicons name="pulse" size={20} color="#0891B2" />
        </View>

        {/* Zones Grid */}
        <View className="mb-4">
          <Text className="text-cyan-900 font-black text-lg mb-4 ml-1">Camera Zones</Text>
          <View className="flex-row flex-wrap justify-between">
            {zones.map((zone) => {
              const ui = getZoneUI(zone.status);
              return (
                <TouchableOpacity
                  key={zone.id}
                  className="w-[48%] mb-4 p-5 rounded-[35px] bg-white shadow-sm border border-gray-50"
                  onPress={() => router.push("/homeowner/surveillance")} // Pointing to itself or a sub-feed
                  activeOpacity={0.8}
                >
                  <View className="items-center">
                    <View className={`p-4 rounded-2xl ${ui.iconBg} shadow-lg mb-3`}>
                      <Ionicons name={ui.icon} size={28} color="white" />
                    </View>
                    <Text className="font-bold text-gray-800 text-base">{zone.name}</Text>
                    <View className={`mt-2 px-3 py-1 rounded-full ${ui.bg}`}>
                      <Text className={`text-[10px] font-black uppercase ${ui.text}`}>
                        {ui.label}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Control Panel Card */}
        <View className="p-6 rounded-[35px] bg-cyan-900 shadow-2xl mt-4">
          <View className="flex-row justify-between items-center mb-6">
            <View>
              <Text className="font-bold text-white text-lg">Main Controller</Text>
              <Text className="text-cyan-300 text-xs mt-1">
                {cameraActive ? "System Armed & Monitoring" : "System Disarmed"}
              </Text>
            </View>
            <View className={`w-3 h-3 rounded-full ${cameraActive ? "bg-green-400" : "bg-red-400"}`} />
          </View>

          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={() => setCameraActive(true)}
              className={`flex-1 py-4 rounded-2xl items-center ${cameraActive ? "bg-cyan-500" : "bg-white/10 border border-white/20"}`}
            >
              <Text className="text-white font-bold">ACTIVATE</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setCameraActive(false)}
              className={`flex-1 py-4 rounded-2xl items-center ${!cameraActive ? "bg-red-500" : "bg-white/10 border border-white/20"}`}
            >
              <Text className="text-white font-bold">DISABLE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}