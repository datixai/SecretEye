import { goBack } from "@/lib/nav";
import { File, Paths } from "expo-file-system";
import { Image } from "expo-image";
import * as MediaLibrary from "expo-media-library";
import { router, useLocalSearchParams } from "expo-router";
import * as Sharing from "expo-sharing";
import { useEffect } from "react";
import { Platform, View } from "react-native";
import { Badge, Button, Card, EmptyState, Header, IconButton, IconTile, Loader, Row, Screen, Section, Text, confirm, toast } from "@/components/ui";
import { deleteDetection, markReviewed, useDetection } from "@/features/data";
import { detectionIcon, detectionTitle, fullDateTime, imageUri, severityOf, timeAgo } from "@/lib/format";

const advice: Record<string, string> = {
  danger: "If you believe someone is in danger, use Emergency SOS or call 15 immediately. Do not confront the person yourself.",
  warn: "Someone the AI doesn't recognise was seen. If they're welcome, add them to Trusted people so you aren't alerted again.",
  info: "Review the snapshot to decide whether any action is needed.",
};

export default function AlertDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: alert, loading } = useDetection(id);

  // Opening an alert marks it as read.
  useEffect(() => {
    if (alert && alert.status !== "reviewed") markReviewed(alert.id).catch(() => {});
  }, [alert]);

  if (loading) return <Loader />;
  if (!alert)
    return (
      <Screen header={<Header title="Alert" />}>
        <EmptyState icon="trash-outline" title="Alert not found" message="It may have been deleted." />
      </Screen>
    );

  const sev = severityOf(alert.type);
  const uri = imageUri(alert.imageUrl);

  const writeTemp = () => {
    const base64 = uri!.split("base64,")[1] ?? "";
    const file = new File(Paths.cache, `secreteye-${alert.id}.jpg`);
    if (file.exists) file.delete();
    file.create();
    file.write(base64, { encoding: "base64" });
    return file.uri;
  };

  const save = async () => {
    if (!uri) return;
    if (Platform.OS === "web") {
      const a = document.createElement("a");
      a.href = uri;
      a.download = `secreteye-${alert.id}.jpg`;
      a.click();
      return;
    }
    try {
      const perm = await MediaLibrary.requestPermissionsAsync(true);
      if (!perm.granted) return toast("Permission needed", { tone: "warn", message: "Allow photo access to save snapshots." });
      await MediaLibrary.createAssetAsync(writeTemp());
      toast("Saved to gallery", { tone: "success" });
    } catch {
      toast("Couldn't save snapshot", { tone: "error" });
    }
  };

  const share = async () => {
    if (!uri || Platform.OS === "web") return;
    try {
      await Sharing.shareAsync(writeTemp(), { mimeType: "image/jpeg" });
    } catch {
      toast("Couldn't share snapshot", { tone: "error" });
    }
  };

  const remove = async () => {
    const ok = await confirm({ title: "Delete this alert?", message: "The snapshot will be permanently removed.", confirmText: "Delete", destructive: true });
    if (!ok) return;
    await deleteDetection(alert.id);
    toast("Alert deleted", { tone: "success" });
    goBack();
  };

  return (
    <Screen
      header={<Header title={detectionTitle(alert)} subtitle={timeAgo(alert.timestamp)} right={<IconButton icon="trash-outline" tone="danger" onPress={remove} accessibilityLabel="Delete alert" />} />}
      footer={
        sev === "danger" ? (
          <Button title="Emergency SOS" variant="danger" icon="alert-circle-outline" onPress={() => router.push("/sos")} />
        ) : undefined
      }
    >
      <View className="mt-2 aspect-[4/3] overflow-hidden rounded-2xl border border-border bg-surface">
        {uri ? (
          <Image source={{ uri }} style={{ width: "100%", height: "100%" }} contentFit="contain" />
        ) : (
          <View className="flex-1 items-center justify-center">
            <IconTile icon={detectionIcon(alert.type)} tone={sev === "info" ? "accent" : sev} size={56} />
            <Text variant="caption" className="mt-2">
              No snapshot
            </Text>
          </View>
        )}
      </View>

      {uri ? (
        <View className="mt-3 flex-row gap-3">
          <View className="flex-1">
            <Button compact variant="secondary" icon="download-outline" title="Save" onPress={save} />
          </View>
          {Platform.OS !== "web" ? (
            <View className="flex-1">
              <Button compact variant="secondary" icon="share-social-outline" title="Share" onPress={share} />
            </View>
          ) : null}
        </View>
      ) : null}

      <Section title="Details" className="mt-6">
        <Row icon="pricetag-outline" title="Type" right={<Badge label={alert.type} tone={sev === "info" ? "info" : sev} />} />
        <Row icon="videocam-outline" title="Camera" value={alert.deviceName || "Camera"} />
        <Row icon="time-outline" title="Time" value={fullDateTime(alert.timestamp)} />
        <Row icon="flag-outline" title="Priority" value={alert.priority || "—"} />
      </Section>

      <Card className={sev === "danger" ? "border-danger/40 bg-danger/10" : sev === "warn" ? "border-warn/40 bg-warn/10" : ""}>
        <Text variant="label" weight="semibold" tone={sev === "danger" ? "danger" : sev === "warn" ? "warn" : "accent"}>
          What to do
        </Text>
        <Text variant="caption" tone="text" className="mt-1">
          {advice[sev]}
        </Text>
        {sev === "warn" ? (
          <Button className="mt-3" compact variant="secondary" icon="person-add-outline" title="Add trusted person" onPress={() => router.push("/trusted/form")} />
        ) : null}
      </Card>
    </Screen>
  );
}
