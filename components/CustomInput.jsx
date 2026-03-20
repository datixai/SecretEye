import React from "react";
import { View, Text, TextInput } from "react-native";

export default function CustomInput({ label, ...props }) {
  return (
    <View className="mb-4">
      {label && (
        <Text className="mb-1 text-gray-700 font-semibold">{label}</Text>
      )}
      <TextInput
        className="bg-white px-4 py-3 rounded-xl shadow-sm text-gray-800"
        placeholderTextColor="#9CA3AF"
        {...props}
      />
    </View>
  );
}
