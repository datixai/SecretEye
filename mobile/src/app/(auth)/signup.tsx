import { zodResolver } from "@hookform/resolvers/zod";
import { router } from "expo-router";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { View } from "react-native";
import { z } from "zod";
import { PhotoPicker } from "@/components/PhotoPicker";
import { Button, Header, Input, Screen, Text } from "@/components/ui";
import { authErrorMessage } from "@/features/auth/errors";
import { useSession } from "@/features/auth/session";
import { auth, db } from "@/lib/firebase";
import { DEFAULT_SETTINGS } from "@/lib/types";

const schema = z
  .object({
    fullName: z.string().trim().min(2, "Enter your full name"),
    email: z.string().trim().email("Enter a valid email"),
    phoneNumber: z.string().trim().min(7, "Enter a phone number"),
    address: z.string().trim().min(3, "Enter your home address"),
    password: z.string().min(6, "At least 6 characters"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match" });
type Form = z.infer<typeof schema>;

const FIELDS: {
  name: keyof Form;
  label: string;
  icon: "person-outline" | "mail-outline" | "call-outline" | "home-outline" | "lock-closed-outline";
  placeholder: string;
  props?: object;
}[] = [
  { name: "fullName", label: "Full name", icon: "person-outline", placeholder: "Jane Doe", props: { autoComplete: "name" } },
  { name: "email", label: "Email", icon: "mail-outline", placeholder: "you@example.com", props: { autoCapitalize: "none", keyboardType: "email-address", autoComplete: "email" } },
  { name: "phoneNumber", label: "Phone", icon: "call-outline", placeholder: "+92 300 0000000", props: { keyboardType: "phone-pad", autoComplete: "tel" } },
  { name: "address", label: "Home address", icon: "home-outline", placeholder: "House, street, city" },
  { name: "password", label: "Password", icon: "lock-closed-outline", placeholder: "At least 6 characters", props: { password: true, autoComplete: "new-password" } },
  { name: "confirm", label: "Confirm password", icon: "lock-closed-outline", placeholder: "Repeat password", props: { password: true } },
];

export default function Signup() {
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: "", email: "", phoneNumber: "", address: "", password: "", confirm: "" },
  });

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    useSession.setState({ signingUp: true });
    try {
      const cred = await createUserWithEmailAndPassword(auth, v.email, v.password);
      const uid = cred.user.uid;
      await updateProfile(cred.user, { displayName: v.fullName });
      await setDoc(doc(db, "users", uid), {
        uid,
        fullName: v.fullName,
        email: v.email.toLowerCase(),
        phoneNumber: v.phoneNumber,
        address: v.address,
        role: "homeowner",
        faceReference: photo,
        createdAt: serverTimestamp(),
      });
      await setDoc(doc(db, "settings", uid), DEFAULT_SETTINGS);
      // Session listener picks up the profile and opens the app.
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      useSession.setState({ signingUp: false });
    }
  });

  return (
    <Screen
      header={<Header title="Create account" />}
      footer={<Button title="Create account" loading={formState.isSubmitting} onPress={onSubmit} />}
    >
      <Text variant="body" tone="muted" className="mb-6 mt-2 text-center">
        Set up SecretEye for your home. Your photo helps the AI recognise you as the homeowner.
      </Text>

      <View className="mb-6">
        <PhotoPicker value={photo} onChange={setPhoto} label="Your photo" />
      </View>

      {FIELDS.map((f) => (
        <Controller
          key={f.name}
          control={control}
          name={f.name}
          render={({ field, fieldState }) => (
            <Input
              label={f.label}
              icon={f.icon}
              placeholder={f.placeholder}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              {...f.props}
            />
          )}
        />
      ))}

      {error ? (
        <View className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3">
          <Text variant="label" tone="danger">
            {error}
          </Text>
        </View>
      ) : null}

      <Text variant="caption" className="text-center">
        Already have an account?{" "}
        <Text variant="caption" tone="accent" weight="semibold" onPress={() => router.replace("/login")}>
          Sign in
        </Text>
      </Text>
    </Screen>
  );
}
