import * as Linking from "expo-linking";
import { View } from "react-native";
import { Header, Row, Screen, Section, Text } from "@/components/ui";

const FAQ = [
  { q: "Why am I not getting alerts?", a: "Check that the system is Armed on Home, the camera is turned on, and the threat type is enabled in Detection settings." },
  { q: "My camera shows “Offline”", a: "Make sure the camera and your phone are on the same Wi-Fi, and that the address (IP:port) is correct. Use “Test connection” when editing the camera." },
  { q: "How do I stop alerts for family?", a: "Add them under Profile → Trusted people with a clear photo of their face." },
  { q: "What happens when I press SOS?", a: "The SecretEye control centre is alerted immediately with your details. You can also call the police (15) from the SOS screen." },
];

export default function Help() {
  return (
    <Screen header={<Header title="Help & support" />}>
      <Section title="Contact" className="mt-2">
        <Row icon="mail-outline" title="Email support" subtitle="datixai.com@gmail.com" onPress={() => Linking.openURL("mailto:datixai.com@gmail.com?subject=SecretEye%20support")} />
        <Row icon="call-outline" title="Police emergency" subtitle="15" onPress={() => Linking.openURL("tel:15")} />
      </Section>
      <Text variant="overline" className="mb-2 ml-1">
        Common questions
      </Text>
      {FAQ.map((f) => (
        <View key={f.q} className="mb-3 rounded-2xl border border-border bg-surface p-4">
          <Text variant="label" weight="semibold">
            {f.q}
          </Text>
          <Text variant="caption" className="mt-1">
            {f.a}
          </Text>
        </View>
      ))}
    </Screen>
  );
}
