import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { Avatar, Button, EmptyState, Header, IconButton, Loader, Screen, Text } from "@/components/ui";
import { Ionicons } from "@expo/vector-icons";
import { useTrustedPeople } from "@/features/data";
import { colors } from "@/theme/colors";

export default function TrustedPeople() {
  const { data, loading } = useTrustedPeople();
  return (
    <Screen
      header={
        <Header
          title="Trusted people"
          subtitle="The AI won't flag these faces"
          right={<IconButton icon="add" tone="accent" onPress={() => router.push("/trusted/form")} accessibilityLabel="Add trusted person" />}
        />
      }
    >
      {loading ? (
        <Loader />
      ) : data.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title="No trusted people yet"
          message="Add family, staff or regular visitors with a clear face photo so they aren't reported as strangers."
          action={<Button icon="person-add-outline" title="Add trusted person" onPress={() => router.push("/trusted/form")} />}
        />
      ) : (
        <View className="mt-2 overflow-hidden rounded-2xl border border-border bg-surface">
          {data.map((p, i) => (
            <View key={p.id}>
              {i > 0 ? <View className="ml-4 h-px bg-border" /> : null}
              <Pressable
                onPress={() => router.push({ pathname: "/trusted/form", params: { id: p.id } })}
                className="flex-row items-center gap-3 px-4 py-3 active:bg-surface2"
              >
                <Avatar name={p.name} photo={p.image?.includes("ui-avatars.com") ? null : p.image} size={44} />
                <View className="flex-1">
                  <Text variant="label">{p.name}</Text>
                  <Text variant="caption">{p.relation}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.subtle} />
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}
