import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useState } from "react";
import { ActivityIndicator, Platform, Pressable, View } from "react-native";
import { imageUri } from "@/lib/format";
import { pickPhoto } from "@/lib/pickPhoto";
import { colors } from "@/theme/colors";
import { Button, Text, toast } from "./ui";

/** Round photo with "Take photo" / "Choose photo" buttons underneath. */
export function PhotoPicker({
  value,
  onChange,
  label = "Add a photo",
  size = 112,
}: {
  value?: string | null;
  onChange: (v: string | null) => void;
  label?: string;
  size?: number;
}) {
  const [busy, setBusy] = useState(false);
  const uri = imageUri(value);

  const run = async (source: "camera" | "library") => {
    try {
      setBusy(true);
      const photo = await pickPhoto(source);
      if (photo) onChange(photo);
    } catch {
      toast("Permission needed", { message: "Allow access in your phone settings to add a photo.", tone: "warn" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="items-center">
      <Pressable
        onPress={() => run("library")}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        className="items-center justify-center overflow-hidden border-2 border-dashed border-border bg-surface"
      >
        {busy ? (
          <ActivityIndicator color={colors.accent} />
        ) : uri ? (
          <Image source={{ uri }} style={{ width: size, height: size }} contentFit="cover" />
        ) : (
          <View className="items-center">
            <Ionicons name="camera-outline" size={28} color={colors.accent} />
            <Text variant="caption" tone="accent" className="mt-1">
              {label}
            </Text>
          </View>
        )}
      </Pressable>
      <View className="mt-3 flex-row gap-2">
        {Platform.OS !== "web" ? (
          <Button compact variant="secondary" icon="camera-outline" title="Take photo" onPress={() => run("camera")} />
        ) : null}
        <Button compact variant="secondary" icon="images-outline" title={uri ? "Change" : "Choose photo"} onPress={() => run("library")} />
      </View>
    </View>
  );
}
