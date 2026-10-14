import { View } from "react-native";
import { cn } from "@/lib/cn";
import { Text } from "./Text";

type Tone = "danger" | "warn" | "ok" | "info" | "neutral";

const bg: Record<Tone, string> = {
  danger: "bg-danger/15",
  warn: "bg-warn/15",
  ok: "bg-ok/15",
  info: "bg-accent/15",
  neutral: "bg-surface2",
};

const fg = { danger: "danger", warn: "warn", ok: "ok", info: "accent", neutral: "muted" } as const;
const dot: Record<Tone, string> = {
  danger: "bg-danger",
  warn: "bg-warn",
  ok: "bg-ok",
  info: "bg-accent",
  neutral: "bg-muted",
};

export function Badge({ label, tone = "neutral", withDot }: { label: string; tone?: Tone; withDot?: boolean }) {
  return (
    <View className={cn("flex-row items-center self-start rounded-full px-2.5 py-1", bg[tone])}>
      {withDot ? <View className={cn("mr-1.5 h-1.5 w-1.5 rounded-full", dot[tone])} /> : null}
      <Text variant="overline" tone={fg[tone]} className="tracking-[0.6px]">
        {label}
      </Text>
    </View>
  );
}
