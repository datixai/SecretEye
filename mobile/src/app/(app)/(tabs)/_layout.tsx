import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useDetections } from "@/features/data";
import { colors } from "@/theme/colors";

type IconName = keyof typeof Ionicons.glyphMap;

const tab = (icon: IconName, activeIcon: IconName) => ({
  tabBarIcon: ({ focused, color }: { focused: boolean; color: string }) => (
    <Ionicons name={focused ? activeIcon : icon} size={22} color={color} />
  ),
});

export default function TabsLayout() {
  const { data } = useDetections();
  const unread = data.filter((d) => d.status !== "reviewed").length;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.subtle,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 64, paddingTop: 6 },
        tabBarLabelStyle: { fontFamily: "Inter_500Medium", fontSize: 11, marginBottom: 6 },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", ...tab("home-outline", "home") }} />
      <Tabs.Screen
        name="alerts"
        options={{
          title: "Alerts",
          tabBarBadge: unread > 0 ? (unread > 99 ? "99+" : unread) : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.danger, color: "#fff", fontSize: 10 },
          ...tab("notifications-outline", "notifications"),
        }}
      />
      <Tabs.Screen name="cameras" options={{ title: "Cameras", ...tab("videocam-outline", "videocam") }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", ...tab("person-circle-outline", "person-circle") }} />
    </Tabs>
  );
}
