import { Text, TouchableOpacity } from "react-native";

export default function CustomButton({ title, onPress, styleProps }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      className={`py-3 rounded-full items-center ${styleProps}`}
    >
      <Text className="text-white font-bold text-lg">{title}</Text>
    </TouchableOpacity>
  );
}
