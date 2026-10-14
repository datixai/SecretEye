import { zodResolver } from "@hookform/resolvers/zod";
import { Link, router } from "expo-router";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { View } from "react-native";
import { z } from "zod";
import { Logo } from "@/components/Logo";
import { Button, Header, Input, Screen, Text } from "@/components/ui";
import { authErrorMessage } from "@/features/auth/errors";
import { auth } from "@/lib/firebase";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});
type Form = z.infer<typeof schema>;

export default function Login() {
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // The root layout switches to the app once the session is ready.
    } catch (e) {
      setError(authErrorMessage(e));
    }
  });

  return (
    <Screen
      header={<Header title="Sign in" />}
      footer={<Button title="Sign in" loading={formState.isSubmitting} onPress={onSubmit} />}
    >
      <View className="mb-8 mt-4 items-center">
        <Logo size={40} />
        <Text variant="body" tone="muted" className="mt-4 text-center">
          Welcome back. Sign in to see what's happening at home.
        </Text>
      </View>

      <Controller
        control={control}
        name="email"
        render={({ field, fieldState }) => (
          <Input
            label="Email"
            icon="mail-outline"
            placeholder="you@example.com"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field, fieldState }) => (
          <Input
            label="Password"
            icon="lock-closed-outline"
            placeholder="Your password"
            password
            autoComplete="password"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            onSubmitEditing={onSubmit}
            error={fieldState.error?.message}
          />
        )}
      />

      {error ? (
        <View className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3">
          <Text variant="label" tone="danger">
            {error}
          </Text>
        </View>
      ) : null}

      <View className="flex-row items-center justify-between">
        <Link href="/forgot-password" asChild>
          <Text variant="label" tone="accent">
            Forgot password?
          </Text>
        </Link>
        <Text variant="label" tone="accent" onPress={() => router.replace("/signup")}>
          Create account
        </Text>
      </View>
    </Screen>
  );
}
