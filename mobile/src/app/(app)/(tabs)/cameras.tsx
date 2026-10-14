import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { CameraFeed } from "@/components/CameraFeed";
import { Button, EmptyState, Header, IconButton, Loader, Screen, Text } from "@/components/ui";
import { useCameras } from "@/features/data";

export default function Cameras() {
  const { data, loading } = useCameras();
  const on = data.filter((c) => c.status === "Active").length;

  return (
    <Screen
      header={
        <Header
          back={false}
          title="Cameras"
          subtitle={data.length ? `${on} of ${data.length} on` : "Connect your first camera"}
          right={<IconButton icon="add" tone="accent" onPress={() => router.push("/camera/form")} accessibilityLabel="Add camera" />}
        />
      }
    >
      {loading ? (
        <Loader />
      ) : data.length === 0 ? (
        <EmptyState
          icon="videocam-outline"
          title="No cameras yet"
          message="Use an IP camera or turn an old Android phone into one with the free “IP Webcam” app."
          action={<Button icon="add" title="Add camera" onPress={() => router.push("/camera/form")} />}
        />
      ) : (
        <View className="mt-2 gap-4">
          {data.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => router.push({ pathname: "/camera/[id]", params: { id: c.id } })}
              className="overflow-hidden rounded-2xl border border-border bg-surface active:opacity-90"
            >
              <CameraFeed camera={c} style={{ width: "100%", aspectRatio: 16 / 9 }} />
              <View className="flex-row items-center justify-between px-4 py-3">
                <View className="flex-1">
                  <Text variant="label" weight="semibold" numberOfLines={1}>
                    {c.name}
                  </Text>
                  <Text variant="caption" numberOfLines={1}>
                    {c.ip}
                  </Text>
                </View>
                <Text variant="caption" tone={c.status === "Active" ? "ok" : "subtle"}>
                  {c.status === "Active" ? "On" : "Off"}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}
