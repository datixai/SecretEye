import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, View, useWindowDimensions } from "react-native";
import { Button, Card, Header, IconTile, Screen, Text, confirm, toast } from "@/components/ui";
import { useSession, useUid } from "@/features/auth/session";
import { cancelEmergency, sendEmergency, useMyEmergencies } from "@/features/data";
import { fullDateTime, toDate } from "@/lib/format";

const HOLD_MS = 2000;
const callPolice = () => Linking.openURL("tel:15");

export default function Sos() {
  const uid = useUid();
  const profile = useSession((s) => s.profile);
  const { data: emergencies } = useMyEmergencies();
  const [progress, setProgress] = useState(0);
  // Big on large phones, but always leaves room for the label on small screens.
  const { width, height } = useWindowDimensions();
  const size = Math.round(Math.max(168, Math.min(256, width - 96, height * 0.36)));
  const [sending, setSending] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // An emergency from the last 2 hours that hasn't been resolved is "active".
  const active = emergencies.find((e) => {
    const t = toDate(e.timestamp);
    const recent = !t || Date.now() - t.getTime() < 2 * 3600 * 1000;
    return recent && (e.status === "open" || e.status === "acknowledged" || e.status === "UNREAD");
  });

  useEffect(() => () => stopHold(), []);

  const stopHold = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setProgress(0);
  };

  const startHold = () => {
    if (sending || active) return;
    const started = Date.now();
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    timer.current = setInterval(() => {
      const p = Math.min(1, (Date.now() - started) / HOLD_MS);
      setProgress(p);
      if (p >= 1) {
        stopHold();
        void trigger();
      }
    }, 30);
  };

  const trigger = async () => {
    setSending(true);
    try {
      await sendEmergency(uid, profile?.fullName ? `${profile.fullName} (${profile.email})` : profile?.email ?? "");
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      toast("SOS sent", { tone: "danger", message: "The control centre has been alerted." });
    } catch {
      toast("Couldn't send SOS", { tone: "error", message: "Call 15 directly." });
    } finally {
      setSending(false);
    }
  };

  const cancel = async () => {
    if (!active) return;
    const ok = await confirm({ title: "Cancel the SOS?", message: "Only cancel if you're safe. The control centre will be told it was cancelled.", confirmText: "I'm safe — cancel", destructive: true });
    if (!ok) return;
    try {
      await cancelEmergency(active.id);
      toast("SOS cancelled", { tone: "success", message: "The control centre has been told you're safe." });
    } catch {
      toast("Couldn't cancel SOS", { tone: "error" });
    }
  };

  const acknowledged = active?.status === "acknowledged";

  return (
    <Screen header={<Header title="Emergency SOS" />} footer={<Button title="Call police (15)" variant="danger" icon="call" onPress={callPolice} />}>
      {active ? (
        <View className="mt-4">
          <Card className={acknowledged ? "border-ok/40 bg-ok/10" : "border-danger/40 bg-danger/10"}>
            <View className="flex-row items-center gap-3">
              <IconTile icon={acknowledged ? "shield-checkmark" : "radio-outline"} tone={acknowledged ? "ok" : "danger"} size={48} />
              <View className="flex-1">
                <Text variant="heading" tone={acknowledged ? "ok" : "danger"}>
                  {acknowledged ? "Help is on the way" : "SOS sent"}
                </Text>
                <Text variant="caption">
                  {acknowledged ? "The control centre has acknowledged your alert." : "Waiting for the control centre to respond…"}
                </Text>
              </View>
            </View>
            <Text variant="caption" tone="subtle" className="mt-3">
              Sent {fullDateTime(active.timestamp)}
            </Text>
          </Card>
          <Text variant="body" tone="muted" className="mt-6">
            Stay somewhere safe. If you're in immediate danger, call the police now.
          </Text>
          <Button className="mt-6" title="I'm safe — cancel SOS" variant="secondary" onPress={cancel} />
        </View>
      ) : (
        <View className="items-center pt-6">
          <Text variant="body" tone="muted" className="text-center">
            Press and hold the button for 2 seconds to alert the SecretEye control centre with your details and address.
          </Text>
          <Pressable
            onPressIn={startHold}
            onPressOut={() => progress < 1 && stopHold()}
            disabled={sending}
            accessibilityRole="button"
            accessibilityLabel="Hold to send SOS"
            style={{ width: size, height: size }}
            className="mt-8 items-center justify-center rounded-full border-4 border-danger/30 bg-danger/10"
          >
            <View
              className="absolute rounded-full bg-danger/25"
              style={{ width: size * (0.55 + 0.45 * progress), height: size * (0.55 + 0.45 * progress) }}
            />
            <View style={{ width: size * 0.56, height: size * 0.56 }} className="items-center justify-center rounded-full bg-danger">
              <Ionicons name="alert" size={size * 0.22} color="#fff" />
            </View>
          </Pressable>
          <Text variant="heading" tone="danger" className="mt-6">
            {sending ? "Sending…" : progress > 0 ? `Keep holding… ${Math.ceil((1 - progress) * 2)}` : "Hold to send SOS"}
          </Text>
        </View>
      )}
    </Screen>
  );
}
