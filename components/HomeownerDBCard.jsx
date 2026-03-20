import { View, Text, TouchableOpacity } from "react-native";

export default function HomeownerDBCard({ icon, title, subtitle, onPress, badge }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="bg-white rounded-2xl p-4 mb-3 flex-row items-center justify-between shadow-sm"
    >
      <View className="flex-row items-center">
        <Text className="text-2xl mr-4">{icon}</Text>

        <View>
          <Text className="font-semibold text-gray-800">{title}</Text>
          <Text className="text-sm text-gray-500">{subtitle}</Text>
        </View>
      </View>

      {badge && (
        <View className="bg-red-500 w-6 h-6 rounded-full items-center justify-center">
          <Text className="text-white text-xs font-bold">2</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}
