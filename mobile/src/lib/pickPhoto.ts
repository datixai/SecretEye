import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

/**
 * Lets the user take or pick a square photo and returns it as a small JPEG
 * data URI (stored directly in Firestore until Firebase Storage is enabled).
 */
export async function pickPhoto(source: "camera" | "library"): Promise<string | null> {
  const perm =
    source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error("permission");

  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 1 };
  const result =
    source === "camera" ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (result.canceled || !result.assets[0]) return null;

  const out = await ImageManipulator.manipulateAsync(result.assets[0].uri, [{ resize: { width: 400, height: 400 } }], {
    compress: 0.6,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });
  return out.base64 ? `data:image/jpeg;base64,${out.base64}` : null;
}
