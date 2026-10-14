import { View } from "react-native";
import { Header, Screen, Text } from "@/components/ui";

const SECTIONS = [
  {
    title: "What we collect",
    body: "Your name, email, phone number and home address; an optional profile photo; the addresses of cameras you add; photos of trusted people you add; and AI detection snapshots from your cameras.",
  },
  {
    title: "How we use it",
    body: "To run AI threat detection on your cameras, show you alerts and evidence, recognise you and your trusted people, and let the SecretEye control centre respond when you use Emergency SOS.",
  },
  {
    title: "Who can see it",
    body: "Only you and authorised SecretEye control-centre staff. We don't sell your data or share it with advertisers.",
  },
  {
    title: "Storage and security",
    body: "Data is stored in Google Firebase with access rules that limit each homeowner to their own data. Connections are encrypted.",
  },
  {
    title: "Your choices",
    body: "You can edit your profile, delete alerts, remove cameras and trusted people at any time. You can delete your account and all its data from Profile → Password & security → Delete account.",
  },
  {
    title: "Contact",
    body: "Questions about privacy: datixai.com@gmail.com",
  },
];

export default function Privacy() {
  return (
    <Screen header={<Header title="Privacy policy" />}>
      <Text variant="caption" className="mb-4 mt-2">
        Last updated October 2026
      </Text>
      {SECTIONS.map((s) => (
        <View key={s.title} className="mb-5">
          <Text variant="label" weight="semibold">
            {s.title}
          </Text>
          <Text variant="body" tone="muted" className="mt-1">
            {s.body}
          </Text>
        </View>
      ))}
    </Screen>
  );
}
