import { router } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { View } from "react-native";
import { Logo } from "@/components/Logo";
import { Button, IconTile, Screen, Text } from "@/components/ui";

const video = require("../../../assets/welcome.mp4");

const FEATURES = [
  { icon: "scan-outline", title: "AI detection", text: "Weapons, violence & strangers" },
  { icon: "notifications-outline", title: "Instant alerts", text: "Snapshot evidence in seconds" },
  { icon: "shield-checkmark-outline", title: "One-tap SOS", text: "Reach the control centre" },
] as const;

export default function Welcome() {
  const player = useVideoPlayer(video, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  return (
    <Screen
      footer={
        <>
          <Button title="Create account" onPress={() => router.push("/signup")} />
          <Button title="I already have an account" variant="secondary" onPress={() => router.push("/login")} />
        </>
      }
    >
      <View className="mt-6 items-center">
        <Logo size={44} />
        <Text variant="display" className="mt-8 text-center">
          The eye that{"\n"}
          <Text variant="display" tone="accent">
            never sleeps.
          </Text>
        </Text>
        <Text variant="body" tone="muted" className="mt-3 max-w-[300px] text-center">
          Smart AI monitoring that protects your home around the clock.
        </Text>
      </View>

      <View className="mt-6 h-48 overflow-hidden rounded-2xl border border-border bg-surface">
        <VideoView player={player} style={{ width: "100%", height: "100%" }} contentFit="cover" nativeControls={false} />
      </View>

      <View className="mt-6 flex-row gap-3">
        {FEATURES.map((f) => (
          <View key={f.title} className="flex-1 items-center">
            <IconTile icon={f.icon} size={44} />
            <Text variant="label" weight="semibold" className="mt-2 text-center">
              {f.title}
            </Text>
            <Text variant="caption" className="mt-0.5 text-center">
              {f.text}
            </Text>
          </View>
        ))}
      </View>
    </Screen>
  );
}
