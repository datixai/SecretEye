import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Children, Fragment } from "react";
import { Pressable, Switch, View } from "react-native";
import { cn } from "@/lib/cn";
import { colors } from "@/theme/colors";
import { Text } from "./Text";

type IconName = keyof typeof Ionicons.glyphMap;

/** Square tinted icon. One style app-wide; only danger rows turn red. */
export function IconTile({ icon, tone = "accent", size = 40 }: { icon: IconName; tone?: "accent" | "danger" | "warn" | "ok"; size?: number }) {
  const map = {
    accent: ["bg-accent/15", colors.accent],
    danger: ["bg-danger/15", colors.danger],
    warn: ["bg-warn/15", colors.warn],
    ok: ["bg-ok/15", colors.ok],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={{ width: size, height: size }} className={cn("items-center justify-center rounded-xl", bg)}>
      <Ionicons name={icon} size={size * 0.5} color={fg} />
    </View>
  );
}

/** Settings-style row: [icon] title / subtitle ........ [value | switch | chevron] */
export function Row({
  icon,
  title,
  subtitle,
  value,
  onPress,
  toggle,
  onToggle,
  danger,
  right,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  toggle?: boolean;
  onToggle?: (v: boolean) => void;
  danger?: boolean;
  right?: ReactNode;
}) {
  const content = (
    <View className="min-h-[60px] flex-row items-center gap-3 px-4 py-3">
      {icon ? <IconTile icon={icon} tone={danger ? "danger" : "accent"} size={36} /> : null}
      <View className="flex-1">
        <Text variant="label" tone={danger ? "danger" : "text"}>
          {title}
        </Text>
        {subtitle ? <Text variant="caption">{subtitle}</Text> : null}
      </View>
      {right}
      {value ? <Text variant="caption">{value}</Text> : null}
      {onToggle ? (
        <Switch
          value={!!toggle}
          onValueChange={onToggle}
          trackColor={{ false: colors.border, true: colors.accent }}
          thumbColor="#FFFFFF"
          {...({ activeThumbColor: "#FFFFFF" } as object)}
        />
      ) : onPress && !danger ? (
        <Ionicons name="chevron-forward" size={18} color={colors.subtle} />
      ) : null}
    </View>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} className="active:bg-surface2">
        {content}
      </Pressable>
    );
  }
  return content;
}

/** Titled group of rows inside one card, with dividers. */
export function Section({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  const items = Children.toArray(children).filter(Boolean);
  return (
    <View className={cn("mb-6", className)}>
      {title ? (
        <Text variant="overline" className="mb-2 ml-1">
          {title}
        </Text>
      ) : null}
      <View className="overflow-hidden rounded-2xl border border-border bg-surface">
        {items.map((child, i) => (
          <Fragment key={i}>
            {i > 0 ? <View className="ml-4 h-px bg-border" /> : null}
            {child}
          </Fragment>
        ))}
      </View>
    </View>
  );
}
