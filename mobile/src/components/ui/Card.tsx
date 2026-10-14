import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { cn } from "@/lib/cn";

export function Card({
  children,
  className,
  onPress,
}: {
  children: ReactNode;
  className?: string;
  onPress?: () => void;
}) {
  const base = cn("rounded-2xl border border-border bg-surface p-4", className);
  if (onPress) {
    return (
      <Pressable onPress={onPress} className={cn(base, "active:opacity-80")}>
        {children}
      </Pressable>
    );
  }
  return <View className={base}>{children}</View>;
}
