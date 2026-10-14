import { Header, Row, Screen, Section, Text, toast } from "@/components/ui";
import { useUid } from "@/features/auth/session";
import { updateSettings, useSettings } from "@/features/data";
import type { UserSettings } from "@/lib/types";

export default function DetectionSettings() {
  const uid = useUid();
  const { settings } = useSettings();

  const set = (key: keyof UserSettings) => (value: boolean) =>
    updateSettings(uid, { [key]: value }).catch(() => toast("Couldn't save setting", { tone: "error" }));

  return (
    <Screen header={<Header title="Detection settings" />}>
      <Text variant="body" tone="muted" className="mb-6 mt-2">
        Choose which threats SecretEye's AI alerts you about. Changes apply to all your cameras immediately.
      </Text>
      <Section title="System">
        <Row
          icon="shield-checkmark-outline"
          title="Armed"
          subtitle={settings.armed ? "You'll get alerts for the threats below" : "All alerts are paused"}
          toggle={settings.armed}
          onToggle={set("armed")}
        />
      </Section>
      <Section title="Threats">
        <Row icon="warning-outline" title="Weapons" subtitle="Guns, knives and other weapons" toggle={settings.weaponEnabled} onToggle={set("weaponEnabled")} />
        <Row icon="flash-outline" title="Violence" subtitle="Fighting and aggressive behaviour" toggle={settings.violenceEnabled} onToggle={set("violenceEnabled")} />
        <Row icon="person-outline" title="Unknown people" subtitle="Faces that aren't you or a trusted person" toggle={settings.faceEnabled} onToggle={set("faceEnabled")} />
      </Section>
    </Screen>
  );
}
