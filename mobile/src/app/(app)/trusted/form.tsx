import { goBack } from "@/lib/nav";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Chips } from "@/components/Chips";
import { PhotoPicker } from "@/components/PhotoPicker";
import { Button, Header, IconButton, Input, Loader, Screen, Text, confirm, toast } from "@/components/ui";
import { useUid } from "@/features/auth/session";
import { deleteTrustedPerson, saveTrustedPerson, useTrustedPerson } from "@/features/data";

const RELATIONS = ["Family", "Friend", "Staff", "Other"] as const;

export default function TrustedForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const uid = useUid();
  const { data: existing, loading } = useTrustedPerson(id);
  const [name, setName] = useState("");
  const [relation, setRelation] = useState<string>("Family");
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setRelation(existing.relation || "Family");
    setPhoto(existing.image?.includes("ui-avatars.com") ? null : existing.image ?? null);
  }, [existing]);

  const save = async () => {
    if (name.trim().length < 2) return setError("Enter their name");
    setSaving(true);
    try {
      await saveTrustedPerson(uid, { name: name.trim(), relation, image: photo }, id);
      toast(id ? "Changes saved" : "Trusted person added", { tone: "success" });
      goBack();
    } catch {
      toast("Couldn't save", { tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!id) return;
    const ok = await confirm({ title: `Remove ${name}?`, message: "They'll be treated as a stranger by the AI again.", confirmText: "Remove", destructive: true });
    if (!ok) return;
    await deleteTrustedPerson(id);
    toast("Removed", { tone: "success" });
    goBack();
  };

  if (id && loading) return <Loader />;

  return (
    <Screen
      header={
        <Header
          title={id ? "Edit trusted person" : "Add trusted person"}
          right={id ? <IconButton icon="trash-outline" tone="danger" onPress={remove} accessibilityLabel="Remove trusted person" /> : undefined}
        />
      }
      footer={<Button title={id ? "Save changes" : "Add person"} loading={saving} onPress={save} />}
    >
      <View className="mb-6 mt-2">
        <PhotoPicker value={photo} onChange={setPhoto} label="Face photo" />
        <Text variant="caption" className="mt-2 text-center">
          Use a clear, front-facing photo for best recognition.
        </Text>
      </View>
      <Input label="Name" icon="person-outline" placeholder="Their full name" value={name}
        onChangeText={(v) => {
          setName(v);
          setError(undefined);
        }}
        error={error} />
      <Text variant="label" tone="muted" className="mb-2">
        Relationship
      </Text>
      <View className="-mx-5">
        <Chips value={relation} onChange={setRelation} options={RELATIONS.map((r) => ({ value: r, label: r }))} />
      </View>
    </Screen>
  );
}
