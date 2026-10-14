import { router, Stack } from "expo-router";
import * as Haptics from "expo-haptics";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { toast } from "@/components/ui";
import { useDetections } from "@/features/data";
import { detectionTitle, severityOf } from "@/lib/format";
import { colors } from "@/theme/colors";

/** Shows an in-app banner when a new detection arrives while the app is open. */
function useNewAlertBanner() {
  const { data, loading } = useDetections();
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (loading) return;
    if (!seen.current) {
      seen.current = new Set(data.map((d) => d.id));
      return;
    }
    for (const d of data) {
      if (seen.current.has(d.id)) continue;
      seen.current.add(d.id);
      const sev = severityOf(d.type);
      toast(detectionTitle(d), {
        message: `${d.deviceName || "Camera"} · tap to view`,
        tone: sev === "danger" ? "danger" : "warn",
        onPress: () => router.push({ pathname: "/alert/[id]", params: { id: d.id } }),
      });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    }
  }, [data, loading]);
}

export default function AppLayout() {
  useNewAlertBanner();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: "slide_from_right" }} />;
}
