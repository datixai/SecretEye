import { Pressable, ScrollView } from "react-native";
import { cn } from "@/lib/cn";
import { Text } from "./ui";

/** Horizontal filter chips — one style app-wide. */
export function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-5" className="mb-3 flex-grow-0">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            className={cn("h-9 flex-row items-center rounded-full border px-4", active ? "border-accent bg-accent" : "border-border bg-surface")}
          >
            <Text variant="label" tone={active ? "ink" : "muted"} weight={active ? "semibold" : "medium"}>
              {o.label}
              {o.count !== undefined ? ` · ${o.count}` : ""}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
