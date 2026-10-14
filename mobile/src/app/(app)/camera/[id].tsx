import { goBack } from "@/lib/nav";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { View } from "react-native";
import { AlertRow } from "@/components/AlertRow";
import { CameraFeed } from "@/components/CameraFeed";
import { EmptyState, Header, IconButton, Loader, Row, Screen, Section, Text, confirm, toast } from "@/components/ui";
import { deleteCamera, setCameraActive, useCamera, useDetections } from "@/features/data";

export default function CameraDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: camera, loading } = useCamera(id);
  const { data: alerts } = useDetections();
  const recent = useMemo(() => (camera ? alerts.filter((a) => a.deviceName === camera.name).slice(0, 5) : []), [alerts, camera]);

  if (loading) return <Loader />;
  if (!camera)
    return (
      <Screen header={<Header title="Camera" />}>
        <EmptyState icon="videocam-off-outline" title="Camera not found" message="It may have been removed." />
      </Screen>
    );

  const active = camera.status === "Active";

  const remove = async () => {
    const ok = await confirm({ title: `Remove ${camera.name}?`, message: "Its past alerts will stay in your history.", confirmText: "Remove", destructive: true });
    if (!ok) return;
    await deleteCamera(camera.id);
    toast("Camera removed", { tone: "success" });
    goBack();
  };

  return (
    <Screen
      header={
        <Header
          title={camera.name}
          subtitle={camera.ip}
          right={<IconButton icon="create-outline" onPress={() => router.push({ pathname: "/camera/form", params: { id: camera.id } })} accessibilityLabel="Edit camera" />}
        />
      }
    >
      <View className="mt-2 overflow-hidden rounded-2xl border border-border">
        <CameraFeed camera={camera} style={{ width: "100%", aspectRatio: 4 / 3 }} />
      </View>

      <Section title="Camera" className="mt-6">
        <Row
          icon={active ? "videocam-outline" : "videocam-off-outline"}
          title="Camera on"
          subtitle={active ? "Live view and AI monitoring enabled" : "Live view and AI monitoring paused"}
          toggle={active}
          onToggle={(v) => setCameraActive(camera.id, v).catch(() => toast("Couldn't update camera", { tone: "error" }))}
        />
        <Row icon="trash-outline" title="Remove camera" danger onPress={remove} />
      </Section>

      <Text variant="overline" className="mb-2 ml-1">
        Recent alerts from this camera
      </Text>
      {recent.length === 0 ? (
        <EmptyState icon="shield-checkmark-outline" title="No alerts" message="Nothing detected on this camera yet." />
      ) : (
        <View className="overflow-hidden rounded-2xl border border-border bg-surface">
          {recent.map((a, i) => (
            <View key={a.id}>
              {i > 0 ? <View className="ml-4 h-px bg-border" /> : null}
              <AlertRow item={a} onPress={() => router.push({ pathname: "/alert/[id]", params: { id: a.id } })} />
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}
