import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useSegments } from "expo-router";

export default function HomeFooter({ active }) {
  const router = useRouter();
  const segments = useSegments();

  // --- AUTO-DETECT ROLE ---
  // If the first part of the URL is 'admin', we use 'admin' routes.
  // This prevents the Admin from accidentally jumping to Homeowner pages.
  const role = segments[0] === "admin" ? "admin" : "homeowner";

  const Tab = ({ name, icon, route }) => {
    const isActive = active === name;

    // Constructs path as /admin/dashboard or /homeowner/dashboard
    const targetRoute = `/${role}${route}`;

    return (
      <TouchableOpacity
        onPress={() => router.push(targetRoute)}
        className="items-center"
      >
        <Ionicons
          name={icon}
          size={22}
          color={isActive ? "#2BB6A8" : "#9CA3AF"}
        />
        <Text
          className={`text-xs mt-1 ${
            isActive ? "text-teal-600" : "text-gray-400"
          }`}
        >
          {name}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View className="flex-row justify-around items-center bg-white py-3 border-t border-gray-200">
      <Tab name="Home" icon="home-outline" route="/dashboard" />
      <Tab name="Activity" icon="activity" route="/activity" />
      <Tab name="Devices" icon="camera-outline" route="/devices" />
      <Tab name="Panic" icon="alert-circle-outline" route="/panic" />
    </View>
  );
}