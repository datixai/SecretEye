import { goBack } from "@/lib/nav";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Image } from "expo-image";
import { View } from "react-native";
import { snapshotUrl } from "@/components/CameraFeed";
import { Button, Card, Header, Input, Loader, Screen, Text, toast } from "@/components/ui";
import { useUid } from "@/features/auth/session";
import { saveCamera, useCamera } from "@/features/data";

export default function CameraForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const uid = useUid();
  const { data: existing, loading } = useCamera(id);
  const [name, setName] = useState("");
  const [ip, setIp] = useState("");
  const [errors, setErrors] = useState<{ name?: string; ip?: string }>({});
  const [saving, setSaving] = useState(false);
  const [test, setTest] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [stamp, setStamp] = useState(0);

  useEffect(() => {
    if (existing) {
      setName(existing.name);
      setIp(existing.ip);
    }
  }, [existing]);

  const validate = () => {
    const e: typeof errors = {};
    if (name.trim().length < 2) e.name = "Give the camera a name";
    if (ip.trim().length < 4) e.ip = "Enter the camera address";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await saveCamera(uid, { name: name.trim(), ip: ip.trim() }, id);
      toast(id ? "Camera updated" : "Camera added", { tone: "success" });
      goBack();
    } catch {
      toast("Couldn't save camera", { tone: "error", message: "Check your connection and try again." });
    } finally {
      setSaving(false);
    }
  };

  const testUrl = snapshotUrl(ip);

  if (id && loading) return <Loader />;

  return (
    <Screen header={<Header title={id ? "Edit camera" : "Add camera"} />} footer={<Button title={id ? "Save changes" : "Add camera"} loading={saving} onPress={save} />}>
      <Input
        label="Name"
        icon="pricetag-outline"
        placeholder="Front door, Living room…"
        value={name}
        onChangeText={(v) => {
          setName(v);
          setErrors((e) => ({ ...e, name: undefined }));
        }}
        error={errors.name}
      />
      <Input
        label="Camera address"
        icon="link-outline"
        placeholder="192.168.1.88:8080"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        value={ip}
        onChangeText={(v) => {
          setIp(v);
          setTest("idle");
          setErrors((e) => ({ ...e, ip: undefined }));
        }}
        error={errors.ip}
        hint="IP and port of the camera on your home Wi-Fi, or an rtsp:// link."
      />

      {testUrl ? (
        <Card className="mb-4">
          <View className="flex-row items-center justify-between">
            <Text variant="label">Connection test</Text>
            <Text variant="caption" tone={test === "ok" ? "ok" : test === "fail" ? "danger" : "muted"}>
              {test === "ok" ? "Connected" : test === "fail" ? "Not reachable" : test === "testing" ? "Testing…" : ""}
            </Text>
          </View>
          {test !== "idle" ? (
            <View className="mt-3 aspect-video overflow-hidden rounded-xl bg-black">
              <Image
                source={{ uri: `${testUrl}?t=${stamp}` }}
                style={{ width: "100%", height: "100%" }}
                cachePolicy="none"
                onLoad={() => setTest("ok")}
                onError={() => setTest("fail")}
              />
            </View>
          ) : null}
          <Button className="mt-3" compact variant="secondary" icon="pulse-outline" title="Test connection" onPress={() => {
              setStamp(Date.now());
              setTest("testing");
            }} />
        </Card>
      ) : null}

      <Card>
        <Text variant="label" weight="semibold">
          Using a spare Android phone?
        </Text>
        <Text variant="caption" className="mt-1">
          Install “IP Webcam” from the Play Store, tap “Start server”, then enter the address shown at the bottom of its screen (for example 192.168.1.88:8080).
        </Text>
      </Card>
    </Screen>
  );
}
