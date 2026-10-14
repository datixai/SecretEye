import { router } from "expo-router";
import { sendPasswordResetEmail } from "firebase/auth";
import { useState } from "react";
import { View } from "react-native";
import { Button, Header, IconTile, Input, Screen, Text } from "@/components/ui";
import { authErrorMessage } from "@/features/auth/errors";
import { auth } from "@/lib/firebase";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Enter a valid email");
    setBusy(true);
    setError(null);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setSent(true);
    } catch (e) {
      // Don't reveal whether the account exists.
      if ((e as { code?: string }).code === "auth/user-not-found") setSent(true);
      else setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      header={<Header title="Reset password" />}
      footer={
        sent ? (
          <Button title="Back to sign in" onPress={() => router.replace("/login")} />
        ) : (
          <Button title="Send reset link" loading={busy} onPress={send} />
        )
      }
    >
      {sent ? (
        <View className="items-center pt-10">
          <IconTile icon="mail-open-outline" tone="ok" size={64} />
          <Text variant="title" className="mt-5 text-center">
            Check your inbox
          </Text>
          <Text variant="body" tone="muted" className="mt-2 text-center">
            If an account exists for {email.trim()}, we've sent a link to reset your password.
          </Text>
        </View>
      ) : (
        <>
          <Text variant="body" tone="muted" className="mb-6 mt-2 text-center">
            Enter the email you signed up with and we'll send you a link to choose a new password.
          </Text>
          <Input
            label="Email"
            icon="mail-outline"
            placeholder="you@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            onSubmitEditing={send}
            error={error ?? undefined}
          />
        </>
      )}
    </Screen>
  );
}
