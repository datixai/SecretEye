import { goBack } from "@/lib/nav";
import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { colors } from "@/theme/colors";
import { Text } from "./Text";

/**
 * The only page header in the app. Layout never changes:
 *   [back]  Title / subtitle ............................ [actions]
 * Tab root screens pass `back={false}` and get a larger title.
 */
export function Header({
  title,
  subtitle,
  back = true,
  onBack,
  right,
  left,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  onBack?: () => void;
  right?: ReactNode;
  /** Replaces the back button (e.g. an avatar on Home). */
  left?: ReactNode;
}) {
  const back_ = onBack ?? goBack;
  return (
    <View className="min-h-[60px] flex-row items-center gap-3 px-5 pb-2 pt-2">
      {left ??
        (back ? (
          <IconButton icon="chevron-back" onPress={back_} accessibilityLabel="Go back" />
        ) : null)}
      <View className="flex-1">
        <Text variant={back ? "heading" : "title"} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View className="flex-row items-center gap-2">{right}</View> : null}
    </View>
  );
}

/** 40×40 round icon button used for header actions and back. */
export function IconButton({
  icon,
  onPress,
  tone = "default",
  accessibilityLabel,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  tone?: "default" | "accent" | "danger";
  accessibilityLabel?: string;
}) {
  const color = tone === "accent" ? colors["accent-ink"] : tone === "danger" ? colors.danger : colors.text;
  const bg = tone === "accent" ? "bg-accent" : "bg-surface2 border border-border";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={8}
      className={`h-10 w-10 items-center justify-center rounded-full active:opacity-70 ${bg}`}
    >
      <Ionicons name={icon} size={20} color={color} />
    </Pressable>
  );
}
