import type { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";
import { colors } from "@/theme/colors";
import { IconTile } from "./Row";
import { Text } from "./Text";

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <View className="items-center rounded-2xl border border-dashed border-border px-6 py-10">
      <IconTile icon={icon} size={52} />
      <Text variant="heading" className="mt-4 text-center">
        {title}
      </Text>
      {message ? (
        <Text variant="caption" className="mt-1 text-center">
          {message}
        </Text>
      ) : null}
      {action ? <View className="mt-5 w-full">{action}</View> : null}
    </View>
  );
}

export function Loader({ label }: { label?: string }) {
  return (
    <View className="flex-1 items-center justify-center bg-bg py-16">
      <ActivityIndicator color={colors.accent} size="large" />
      {label ? (
        <Text variant="caption" className="mt-3">
          {label}
        </Text>
      ) : null}
    </View>
  );
}
