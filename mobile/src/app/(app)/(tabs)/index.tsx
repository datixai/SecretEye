import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { AlertRow } from "@/components/AlertRow";
import { Avatar, Button, Card, EmptyState, Header, IconButton, IconTile, Screen, Text, toast } from "@/components/ui";
import { useSession, useUid } from "@/features/auth/session";
import { updateSettings, useCameras, useDetections, useSettings } from "@/features/data";
import { detectionKind, firstName, toDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { colors } from "@/theme/colors";

export default function Home() {
  const uid = useUid();
  const profile = useSession((s) => s.profile);
  const { settings } = useSettings();
  const { data: alerts, loading } = useDetections();
  const { data: cameras, loading: camerasLoading } = useCameras();
  const [arming, setArming] = useState(false);

  const today = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const counts = { Weapon: 0, Violence: 0, Stranger: 0 };
    for (const a of alerts) {
      const d = toDate(a.timestamp);
      if (!d || d < start) continue;
      const k = detectionKind(a.type);
      if (k in counts) counts[k as keyof typeof counts] += 1;
    }
    return counts;
  }, [alerts]);

  const activeCams = cameras.filter((c) => c.status === "Active").length;
  const unread = alerts.filter((a) => a.status !== "reviewed").length;

  const toggleArmed = async () => {
    setArming(true);
    try {
      await updateSettings(uid, { armed: !settings.armed });
      toast(settings.armed ? "System disarmed" : "System armed", {
        tone: settings.armed ? "warn" : "success",
        message: settings.armed ? "AI alerts are paused." : "AI is watching your cameras.",
      });
    } catch {
      toast("Couldn't update", { tone: "error", message: "Check your connection and try again." });
    } finally {
      setArming(false);
    }
  };

  return (
    <Screen
      header={
        <Header
          back={false}
          title={`Hi, ${firstName(profile?.fullName)}`}
          subtitle={profile?.address || "Your home"}
          left={
            <Pressable onPress={() => router.push("/profile")} accessibilityLabel="Open profile">
              <Avatar name={profile?.fullName} photo={profile?.faceReference} size={44} />
            </Pressable>
          }
          right={<IconButton icon="notifications-outline" onPress={() => router.push("/alerts")} accessibilityLabel="Alerts" />}
        />
      }
    >
      {/* System status */}
      <Card className={cn("mt-2", settings.armed ? "border-accent/40" : "border-warn/40")}>
        <View className="flex-row items-center gap-3">
          <IconTile icon={settings.armed ? "shield-checkmark" : "shield-outline"} tone={settings.armed ? "accent" : "warn"} size={48} />
          <View className="flex-1">
            <Text variant="heading">{settings.armed ? "Armed" : "Disarmed"}</Text>
            <Text variant="caption">
              {settings.armed ? "AI is watching for threats" : "Alerts are paused"} · {activeCams}/{cameras.length} cameras on
            </Text>
          </View>
        </View>
        <Button
          className="mt-4"
          compact
          variant={settings.armed ? "secondary" : "primary"}
          icon={settings.armed ? "pause-circle-outline" : "shield-checkmark-outline"}
          title={settings.armed ? "Disarm" : "Arm system"}
          loading={arming}
          onPress={toggleArmed}
        />
      </Card>

      {/* Today */}
      <Text variant="overline" className="mb-2 ml-1 mt-6">
        Today
      </Text>
      <View className="flex-row gap-3">
        <Stat label="Weapons" value={today.Weapon} icon="warning-outline" tone="danger" />
        <Stat label="Violence" value={today.Violence} icon="flash-outline" tone="danger" />
        <Stat label="Strangers" value={today.Stranger} icon="person-outline" tone="warn" />
      </View>

      {/* Recent alerts */}
      <SectionTitle title="Recent alerts" action={alerts.length ? "See all" : undefined} onAction={() => router.push("/alerts")} badge={unread} />
      {loading ? null : alerts.length === 0 ? (
        <EmptyState icon="shield-checkmark-outline" title="All quiet" message="AI detections will appear here the moment they happen." />
      ) : (
        <View className="overflow-hidden rounded-2xl border border-border bg-surface">
          {alerts.slice(0, 4).map((a, i) => (
            <View key={a.id}>
              {i > 0 ? <View className="ml-4 h-px bg-border" /> : null}
              <AlertRow item={a} onPress={() => router.push({ pathname: "/alert/[id]", params: { id: a.id } })} />
            </View>
          ))}
        </View>
      )}

      {/* Cameras */}
      <SectionTitle title="Cameras" action={cameras.length ? "Manage" : undefined} onAction={() => router.push("/cameras")} />
      {camerasLoading ? null : cameras.length === 0 ? (
        <EmptyState
          icon="videocam-outline"
          title="No cameras yet"
          message="Add your first camera so SecretEye can start watching."
          action={<Button compact icon="add" title="Add camera" onPress={() => router.push("/camera/form")} />}
        />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3">
          {cameras.map((c) => (
            <Card key={c.id} className="w-40 p-3" onPress={() => router.push({ pathname: "/camera/[id]", params: { id: c.id } })}>
              <IconTile icon={c.status === "Active" ? "videocam" : "videocam-off-outline"} tone={c.status === "Active" ? "accent" : "warn"} size={36} />
              <Text variant="label" className="mt-3" numberOfLines={1}>
                {c.name}
              </Text>
              <Text variant="caption" tone={c.status === "Active" ? "ok" : "subtle"}>
                {c.status === "Active" ? "On" : "Off"}
              </Text>
            </Card>
          ))}
        </ScrollView>
      )}

      {/* SOS */}
      <Pressable
        onPress={() => router.push("/sos")}
        className="mt-6 flex-row items-center gap-3 rounded-2xl border border-danger/40 bg-danger/10 p-4 active:opacity-80"
      >
        <IconTile icon="alert-circle" tone="danger" size={48} />
        <View className="flex-1">
          <Text variant="heading" tone="danger">
            Emergency SOS
          </Text>
          <Text variant="caption">Alert the SecretEye control centre</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.danger} />
      </Pressable>
    </Screen>
  );
}

function Stat({ label, value, icon, tone }: { label: string; value: number; icon: "warning-outline" | "flash-outline" | "person-outline"; tone: "danger" | "warn" }) {
  return (
    <View className="flex-1 rounded-2xl border border-border bg-surface p-3">
      <IconTile icon={icon} tone={value > 0 ? tone : "accent"} size={32} />
      <Text variant="title" className="mt-3">
        {value}
      </Text>
      <Text variant="caption">{label}</Text>
    </View>
  );
}

function SectionTitle({ title, action, onAction, badge }: { title: string; action?: string; onAction?: () => void; badge?: number }) {
  return (
    <View className="mb-2 ml-1 mt-6 flex-row items-center justify-between">
      <View className="flex-row items-center gap-2">
        <Text variant="overline">{title}</Text>
        {badge ? (
          <View className="rounded-full bg-danger px-1.5">
            <Text variant="overline" tone="white" className="tracking-normal">
              {badge}
            </Text>
          </View>
        ) : null}
      </View>
      {action ? (
        <Text variant="label" tone="accent" onPress={onAction}>
          {action}
        </Text>
      ) : null}
    </View>
  );
}
