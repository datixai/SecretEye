import { Image } from "expo-image";
import { Pressable, View } from "react-native";
import { detectionIcon, detectionTitle, imageUri, severityOf, timeAgo } from "@/lib/format";
import type { Detection } from "@/lib/types";
import { IconTile, Text } from "./ui";

/** One detection in a list: [snapshot] title / camera · time ......... [unread dot] */
export function AlertRow({ item, onPress }: { item: Detection; onPress: () => void }) {
  const sev = severityOf(item.type);
  const uri = imageUri(item.imageUrl);
  const unread = item.status !== "reviewed";
  return (
    <Pressable onPress={onPress} className="flex-row items-center gap-3 px-4 py-3 active:bg-surface2">
      {uri ? (
        <View className="h-14 w-14 overflow-hidden rounded-xl border border-border bg-surface2">
          <Image source={{ uri }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
        </View>
      ) : (
        <IconTile icon={detectionIcon(item.type)} tone={sev === "info" ? "accent" : sev} size={56} />
      )}
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <View className={`h-2 w-2 rounded-full ${sev === "danger" ? "bg-danger" : sev === "warn" ? "bg-warn" : "bg-accent"}`} />
          <Text variant="label" weight={unread ? "semibold" : "medium"} numberOfLines={1} className="flex-1">
            {detectionTitle(item)}
          </Text>
        </View>
        <Text variant="caption" numberOfLines={1} className="mt-0.5">
          {item.deviceName || "Camera"} · {timeAgo(item.timestamp)}
        </Text>
      </View>
      {unread ? <View className="h-2.5 w-2.5 rounded-full bg-accent" /> : null}
    </Pressable>
  );
}
