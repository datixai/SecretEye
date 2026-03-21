import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useSegments } from "expo-router";

// Auto-detects role from the current route segment.
// Admin tabs route to /admin/... and homeowner tabs to /homeowner/...
export default function HomeFooter({ active }) {
  const router = useRouter();
  const segments = useSegments();

  const role = segments[0] === "admin" ? "admin" : "homeowner";

  const Tab = ({ name, icon, route }) => {
    const isActive = active === name;
    const targetRoute = `/${role}${route}`;

    return (
      <TouchableOpacity
        onPress={() => router.push(targetRoute)}
        className="items-center px-2"
      >
        <Ionicons
          name={icon}
          size={22}
          color={isActive ? "#2BB6A8" : "#9CA3AF"}
        />
        <Text
          className={`text-xs mt-1 ${
            isActive ? "text-teal-600 font-bold" : "text-gray-400"
          }`}
        >
          {name}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View className="flex-row justify-around items-center bg-white py-3 border-t border-gray-200 shadow-lg">
      <Tab name="Home"     icon="home-outline"          route="/dashboard" />
      {/* FIX: "activity" is not a valid Ionicons name — changed to "pulse-outline" */}
      <Tab name="Activity" icon="pulse-outline"          route="/activity"  />
      <Tab name="Devices"  icon="camera-outline"         route="/devices"   />
      <Tab name="Panic"    icon="alert-circle-outline"   route="/panic"     />
    </View>
  );
}
