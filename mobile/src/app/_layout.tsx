import "../../global.css";

import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { FeedbackHost } from "@/components/ui";
import { startSessionListener, useSession } from "@/features/auth/session";
import { colors } from "@/theme/colors";

SplashScreen.preventAutoHideAsync().catch(() => {});
startSessionListener();

const navTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.surface, border: colors.border, primary: colors.accent, text: colors.text },
};

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const liveStatus = useSession((s) => s.status);
  // After the first load, keep showing the previous screens while the session
  // briefly re-loads (e.g. during signup) instead of blanking the app.
  const stable = useRef(liveStatus);
  if (liveStatus !== "loading") stable.current = liveStatus;
  const status = stable.current;
  const ready = fontsLoaded && status !== "loading";

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <ThemeProvider value={navTheme}>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: "slide_from_right" }}>
            <Stack.Protected guard={status === "ready"}>
              <Stack.Screen name="(app)" />
            </Stack.Protected>
            <Stack.Protected guard={status === "blocked"}>
              <Stack.Screen name="blocked" />
            </Stack.Protected>
            <Stack.Protected guard={status === "signedOut"}>
              <Stack.Screen name="(auth)" />
            </Stack.Protected>
          </Stack>
          <FeedbackHost />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
