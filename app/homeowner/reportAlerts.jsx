import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import AlertCard from "../../components/AlertCard";

export default function ReportsAlerts() {
  const router = useRouter();

  const reports = [
    {
      id: 1,
      title: "Motion Detected",
      subtitle: "Front Door Camera",
      time: "2025-12-16 14:30",
      type: "alert",
    },
    {
      id: 2,
      title: "Face Recognized",
      subtitle: "Garage Camera",
      time: "2025-12-16 13:50",
      type: "report",
    },
    {
      id: 3,
      title: "Suspicious Activity",
      subtitle: "Backyard Camera",
      time: "2025-12-15 22:15",
      type: "alert",
    },
    {
      id: 4,
      title: "System Armed",
      subtitle: "Main Control",
      time: "2025-12-15 08:00",
      type: "report",
    },
  ];

  return (
    <LinearGradient colors={["#ECFEFF", "#FFFFFF"]} style={{ flex: 1 }}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-6 pt-8 pb-6">
        <TouchableOpacity
          onPress={() => router.back()}
          className="p-3 rounded-full bg-white shadow-xl border border-gray-200"
        >
          <Ionicons name="arrow-back" size={22} color="#0C4A6E" />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-gray-800">
          Reports & Alerts
        </Text>
        <View className="w-10" />
      </View>

      {/* Scrollable Content */}
      <ScrollView
        className="px-6 pt-4"
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {reports.map((item) => (
          <AlertCard
            key={item.id}
            title={item.title}
            subtitle={item.subtitle}
            time={item.time}
            type={item.type}
          />
        ))}
      </ScrollView>
    </LinearGradient>
  );
}
