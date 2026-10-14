import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, View, type PressableProps } from "react-native";
import { cn } from "@/lib/cn";
import { colors } from "@/theme/colors";
import { Text, type Tone } from "./Text";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const container: Record<Variant, string> = {
  primary: "bg-accent",
  secondary: "bg-surface2 border border-border",
  danger: "bg-danger",
  ghost: "bg-transparent",
};

const labelTone: Record<Variant, Tone> = {
  primary: "ink",
  secondary: "text",
  danger: "white",
  ghost: "accent",
};

const iconColor: Record<Variant, string> = {
  primary: colors["accent-ink"],
  secondary: colors.text,
  danger: "#FFFFFF",
  ghost: colors.accent,
};

/**
 * The only button in the app. Full width by default so primary actions sit in
 * the same place on every screen.
 */
export function Button({
  title,
  variant = "primary",
  icon,
  loading,
  disabled,
  compact,
  className,
  ...props
}: PressableProps & {
  title: string;
  variant?: Variant;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      className={cn(
        "flex-row items-center justify-center rounded-xl active:opacity-80",
        compact ? "h-10 px-4" : "h-[52px] px-5",
        container[variant],
        isDisabled && "opacity-50",
        className,
      )}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={iconColor[variant]} />
      ) : (
        <View className="flex-row items-center">
          {icon && <Ionicons name={icon} size={compact ? 16 : 18} color={iconColor[variant]} style={{ marginRight: 8 }} />}
          <Text variant={compact ? "label" : "body"} weight="semibold" tone={labelTone[variant]}>
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
