import { router } from "expo-router";
import { writeBatch, doc } from "firebase/firestore";
import { useMemo, useState } from "react";
import { FlatList, View } from "react-native";
import { AlertRow } from "@/components/AlertRow";
import { Chips } from "@/components/Chips";
import { EmptyState, Header, IconButton, Loader, Screen, toast } from "@/components/ui";
import { useDetections } from "@/features/data";
import { detectionKind } from "@/lib/format";
import { db } from "@/lib/firebase";

type Filter = "all" | "unread" | "Weapon" | "Violence" | "Stranger";

export default function Alerts() {
  const { data, loading } = useDetections();
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(() => {
    const c = { all: data.length, unread: 0, Weapon: 0, Violence: 0, Stranger: 0 } as Record<Filter, number>;
    for (const d of data) {
      if (d.status !== "reviewed") c.unread += 1;
      const k = detectionKind(d.type);
      if (k !== "Other") c[k] += 1;
    }
    return c;
  }, [data]);

  const items = useMemo(() => {
    if (filter === "all") return data;
    if (filter === "unread") return data.filter((d) => d.status !== "reviewed");
    return data.filter((d) => detectionKind(d.type) === filter);
  }, [data, filter]);

  const markAllRead = async () => {
    const unread = data.filter((d) => d.status !== "reviewed");
    if (!unread.length) return toast("You're all caught up", { tone: "info" });
    try {
      for (let i = 0; i < unread.length; i += 450) {
        const batch = writeBatch(db);
        unread.slice(i, i + 450).forEach((d) => batch.update(doc(db, "detections", d.id), { status: "reviewed" }));
        await batch.commit();
      }
      toast("All alerts marked as read", { tone: "success" });
    } catch {
      toast("Couldn't update alerts", { tone: "error" });
    }
  };

  return (
    <Screen
      scroll={false}
      padded={false}
      header={
        <Header
          back={false}
          title="Alerts"
          subtitle={counts.unread ? `${counts.unread} unread` : "All caught up"}
          right={<IconButton icon="checkmark-done-outline" onPress={markAllRead} accessibilityLabel="Mark all as read" />}
        />
      }
    >
      <Chips
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "All", count: counts.all },
          { value: "unread", label: "Unread", count: counts.unread },
          { value: "Weapon", label: "Weapons", count: counts.Weapon },
          { value: "Violence", label: "Violence", count: counts.Violence },
          { value: "Stranger", label: "Strangers", count: counts.Stranger },
        ]}
      />
      {loading ? (
        <Loader />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(d) => d.id}
          contentContainerClassName="px-5 pb-8"
          ItemSeparatorComponent={() => <View className="ml-4 h-px bg-border" />}
          renderItem={({ item, index }) => (
            <View
              className={`overflow-hidden border-x border-border bg-surface ${index === 0 ? "rounded-t-2xl border-t" : ""} ${
                index === items.length - 1 ? "rounded-b-2xl border-b" : ""
              }`}
            >
              <AlertRow item={item} onPress={() => router.push({ pathname: "/alert/[id]", params: { id: item.id } })} />
            </View>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="shield-checkmark-outline"
              title={filter === "all" ? "No alerts yet" : "Nothing here"}
              message={filter === "all" ? "When the AI detects a threat you'll see it here with a snapshot." : "No alerts match this filter."}
            />
          }
        />
      )}
    </Screen>
  );
}
