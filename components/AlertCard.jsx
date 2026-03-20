import { View, Text, Image } from "react-native";

export default function AlertCard({ thumbnail, title, subtitle, time, type }) {
  const borderColor = type === "alert" ? "#E53E3E" : "#319795";

  return (
    <View className="mb-4 rounded-lg shadow-sm bg-white">
      {/* Thumbnail */}
      {thumbnail && (
        <Image
          source={{ uri: thumbnail }}
          className="w-full h-40 rounded-t-lg"
          resizeMode="cover"
        />
      )}

      {/* Info */}
      <View className="p-3" style={{ borderLeftWidth: 4, borderLeftColor: borderColor }}>
        <Text className="font-semibold text-lg text-gray-800">{title}</Text>
        <Text className="text-gray-600 mt-1">{subtitle}</Text>
        <Text className="text-gray-400 text-xs mt-1">{time}</Text>
      </View>
    </View>
  );
}
