import Constants from "expo-constants";
import { router } from "expo-router";
import { signOut } from "firebase/auth";
import { View } from "react-native";
import { Avatar, Button, Card, Header, Row, Screen, Section, Text, confirm } from "@/components/ui";
import { useSession } from "@/features/auth/session";
import { useCameras, useTrustedPeople } from "@/features/data";
import { auth } from "@/lib/firebase";

export default function Profile() {
  const profile = useSession((s) => s.profile);
  const { data: trusted, loading: trustedLoading } = useTrustedPeople();
  const { data: cameras, loading: camerasLoading } = useCameras();

  const logout = async () => {
    const ok = await confirm({ title: "Sign out?", message: "You'll stop seeing alerts on this device until you sign in again.", confirmText: "Sign out", destructive: true });
    if (ok) await signOut(auth);
  };

  return (
    <Screen header={<Header back={false} title="Profile" />}>
      <Card className="mt-2 flex-row items-center gap-4" onPress={() => router.push("/settings/edit-profile")}>
        <Avatar name={profile?.fullName} photo={profile?.faceReference} size={64} />
        <View className="flex-1">
          <Text variant="heading" numberOfLines={1}>
            {profile?.fullName}
          </Text>
          <Text variant="caption" numberOfLines={1}>
            {profile?.email}
          </Text>
          <Text variant="caption" tone="accent" className="mt-1">
            Edit profile
          </Text>
        </View>
      </Card>

      <Section title="Home security" className="mt-6">
        <Row icon="people-outline" title="Trusted people" subtitle="Faces the AI won't flag as strangers" value={trustedLoading ? undefined : String(trusted.length)} onPress={() => router.push("/trusted")} />
        <Row icon="scan-outline" title="Detection settings" subtitle="Choose what the AI watches for" onPress={() => router.push("/settings/detection")} />
        <Row icon="videocam-outline" title="Cameras" value={camerasLoading ? undefined : String(cameras.length)} onPress={() => router.push("/cameras")} />
        <Row icon="alert-circle-outline" title="Emergency SOS" subtitle="Alert the control centre" onPress={() => router.push("/sos")} />
      </Section>

      <Section title="Account">
        <Row icon="lock-closed-outline" title="Password & security" onPress={() => router.push("/settings/security")} />
        <Row icon="document-text-outline" title="Privacy policy" onPress={() => router.push("/settings/privacy")} />
        <Row icon="help-circle-outline" title="Help & support" onPress={() => router.push("/settings/help")} />
      </Section>

      <Button title="Sign out" variant="secondary" icon="log-out-outline" onPress={logout} />
      <Text variant="caption" tone="subtle" className="mt-4 text-center">
        SecretEye v{Constants.expoConfig?.version ?? "2.0.0"}
      </Text>
    </Screen>
  );
}
