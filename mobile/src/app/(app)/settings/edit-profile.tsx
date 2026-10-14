import { goBack } from "@/lib/nav";
import { updateProfile } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { useState } from "react";
import { View } from "react-native";
import { PhotoPicker } from "@/components/PhotoPicker";
import { Button, Header, Input, Screen, toast } from "@/components/ui";
import { useSession } from "@/features/auth/session";
import { auth, db } from "@/lib/firebase";

export default function EditProfile() {
  const profile = useSession((s) => s.profile)!;
  const [fullName, setFullName] = useState(profile.fullName ?? "");
  const [phoneNumber, setPhone] = useState(profile.phoneNumber ?? "");
  const [address, setAddress] = useState(profile.address ?? "");
  const [photo, setPhoto] = useState<string | null>(profile.faceReference ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const save = async () => {
    if (fullName.trim().length < 2) return setError("Enter your full name");
    setSaving(true);
    try {
      await updateDoc(doc(db, "users", profile.uid), {
        fullName: fullName.trim(),
        phoneNumber: phoneNumber.trim(),
        address: address.trim(),
        faceReference: photo,
      });
      if (auth.currentUser) await updateProfile(auth.currentUser, { displayName: fullName.trim() });
      toast("Profile updated", { tone: "success" });
      goBack();
    } catch {
      toast("Couldn't save profile", { tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen header={<Header title="Edit profile" />} footer={<Button title="Save changes" loading={saving} onPress={save} />}>
      <View className="mb-6 mt-2">
        <PhotoPicker value={photo} onChange={setPhoto} label="Your photo" />
      </View>
      <Input label="Full name" icon="person-outline" value={fullName} onChangeText={setFullName} error={error} />
      <Input label="Email" icon="mail-outline" value={profile.email} editable={false} hint="Contact support to change your email." />
      <Input label="Phone" icon="call-outline" keyboardType="phone-pad" value={phoneNumber} onChangeText={setPhone} />
      <Input label="Home address" icon="home-outline" value={address} onChangeText={setAddress} />
    </Screen>
  );
}
