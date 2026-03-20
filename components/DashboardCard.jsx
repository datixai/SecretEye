import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function DashboardCard({ icon, title, subtitle, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="bg-white rounded-3xl p-6 mb-4 shadow-xl border border-gray-200"
      activeOpacity={0.8}
    >
      <View className="flex-row items-center gap-4">
        {/* Icon */}
        <View className="w-16 h-16 rounded-2xl items-center justify-center">
          {icon}
        </View>

        {/* Texts */}
        <View className="flex-1">
          <Text className="text-xl font-bold text-gray-800 mb-1">{title}</Text>
          <Text className="text-base text-gray-600 font-medium">
            {subtitle}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={24} color="#9CA3AF" />
      </View>
    </TouchableOpacity>
  );
}
