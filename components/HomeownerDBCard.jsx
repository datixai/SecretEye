import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";

// FIX: Original wrapped icon in <Text> — React Native cannot render
// View or Ionicons components inside Text. Changed to <View>.
export default function HomeownerDBCard({ icon, title, subtitle, onPress, badge }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="bg-white rounded-3xl p-5 mb-4 shadow-xl border border-gray-100"
      activeOpacity={0.8}
    >
      <View className="flex-row items-center">
        <View className="mr-4">{icon}</View>

        <View className="flex-1">
          <Text className="text-lg font-bold text-gray-800 mb-1">{title}</Text>
          <Text className="text-sm text-gray-500 font-medium">{subtitle}</Text>
        </View>

        {badge ? (
          <View className="bg-red-500 w-6 h-6 rounded-full items-center justify-center ml-2">
            <Text className="text-white text-xs font-bold">!</Text>
          </View>
        ) : (
          <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
        )}
      </View>
    </TouchableOpacity>
  );
}
