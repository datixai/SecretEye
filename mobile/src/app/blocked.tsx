import { signOut } from "firebase/auth";
import { View } from "react-native";
import { Button, IconTile, Screen, Text } from "@/components/ui";
import { useSession } from "@/features/auth/session";
import { auth } from "@/lib/firebase";

// Admin accounts manage SecretEye from the admin website, not the app.
export default function Blocked() {
  const reason = useSession((s) => s.blockedReason);
  const isAdmin = reason === "admin";
  return (
    <Screen scroll={false} footer={<Button title="Sign out" variant="secondary" icon="log-out-outline" onPress={() => signOut(auth)} />}>
      <View className="flex-1 items-center justify-center">
        <IconTile icon={isAdmin ? "desktop-outline" : "lock-closed-outline"} tone={isAdmin ? "accent" : "danger"} size={64} />
        <Text variant="title" className="mt-5 text-center">
          {isAdmin ? "Use the admin website" : "Account disabled"}
        </Text>
        <Text variant="body" tone="muted" className="mt-2 text-center">
          {isAdmin
            ? "This is an administrator account. The SecretEye app is for homeowners — please sign in to the SecretEye admin website instead."
            : "Your account has been disabled by SecretEye support. Contact support if you think this is a mistake."}
        </Text>
      </View>
    </Screen>
  );
}
