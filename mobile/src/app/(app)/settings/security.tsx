import { sendPasswordResetEmail } from "firebase/auth";
import { useState } from "react";
import { Button, Card, Header, Input, Row, Screen, Section, Text, confirm, toast } from "@/components/ui";
import { changePassword, deleteAccount } from "@/features/auth/account";
import { authErrorMessage } from "@/features/auth/errors";
import { useSession } from "@/features/auth/session";
import { auth } from "@/lib/firebase";

export default function Security() {
  const email = useSession((s) => s.profile?.email ?? s.user?.email ?? "");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [errors, setErrors] = useState<{ current?: string; next?: string; repeat?: string }>({});
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const e: typeof errors = {};
    if (!current) e.current = "Enter your current password";
    if (next.length < 6) e.next = "At least 6 characters";
    if (next !== repeat) e.repeat = "Passwords don't match";
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      await changePassword(current, next);
      setCurrent("");
      setNext("");
      setRepeat("");
      toast("Password changed", { tone: "success" });
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "auth/invalid-credential" || code === "auth/wrong-password") setErrors({ current: "Current password is incorrect" });
      else toast(authErrorMessage(err), { tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  const sendReset = async () => {
    try {
      await sendPasswordResetEmail(auth, email);
      toast("Reset link sent", { tone: "success", message: `Check ${email}` });
    } catch (err) {
      toast(authErrorMessage(err), { tone: "error" });
    }
  };

  const remove = async () => {
    const password = await confirm({
      title: "Delete your account?",
      message: "This permanently deletes your profile, cameras, alerts and trusted people. This can't be undone. Enter your password to confirm.",
      confirmText: "Delete account",
      destructive: true,
      passwordPrompt: true,
    });
    if (!password) return;
    try {
      await deleteAccount(password);
      toast("Account deleted", { tone: "success" });
    } catch (err) {
      const code = (err as { code?: string }).code;
      toast(code === "auth/invalid-credential" || code === "auth/wrong-password" ? "Incorrect password" : authErrorMessage(err), { tone: "error" });
    }
  };

  return (
    <Screen header={<Header title="Password & security" />}>
      <Text variant="overline" className="mb-2 ml-1 mt-2">
        Change password
      </Text>
      <Card className="mb-6">
        <Input label="Current password" password value={current} onChangeText={setCurrent} error={errors.current} />
        <Input label="New password" password value={next} onChangeText={setNext} error={errors.next} />
        <Input label="Repeat new password" password value={repeat} onChangeText={setRepeat} error={errors.repeat} />
        <Button title="Update password" loading={saving} onPress={submit} />
      </Card>

      <Section title="Other options">
        <Row icon="mail-outline" title="Email me a reset link" subtitle={email} onPress={sendReset} />
      </Section>

      <Section title="Danger zone">
        <Row icon="trash-outline" title="Delete account" subtitle="Permanently remove your account and data" danger onPress={remove} />
      </Section>
    </Screen>
  );
}
