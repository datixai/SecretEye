import { Image } from "expo-image";
import { View } from "react-native";
import { imageUri, initials } from "@/lib/format";
import { Text } from "./Text";

/** Same avatar everywhere: photo if we have one, otherwise initials on accent tint. */
export function Avatar({ name, photo, size = 44 }: { name?: string; photo?: string | null; size?: number }) {
  const uri = imageUri(photo);
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2 }}
      className="items-center justify-center overflow-hidden border border-border bg-accent/15"
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size }} contentFit="cover" />
      ) : (
        <Text weight="semibold" tone="accent" style={{ fontSize: size * 0.36 }}>
          {initials(name)}
        </Text>
      )}
    </View>
  );
}
