import type { Timestamp } from "firebase/firestore";

// Firestore data model — see firebase/DATA_MODEL.md. Field names stay
// compatible with older records and the Python backend.

export type Role = "homeowner" | "admin";

export interface UserProfile {
  uid: string;
  fullName: string;
  email: string;
  phoneNumber?: string;
  address?: string;
  role: Role;
  /** Raw base64 JPEG (no data: prefix) or a full data/https URI. */
  faceReference?: string | null;
  disabled?: boolean;
  createdAt?: Timestamp;
}

export interface UserSettings {
  armed: boolean;
  faceEnabled: boolean;
  weaponEnabled: boolean;
  violenceEnabled: boolean;
}

export const DEFAULT_SETTINGS: UserSettings = {
  armed: true,
  faceEnabled: true,
  weaponEnabled: true,
  violenceEnabled: true,
};

export type DeviceStatus = "Active" | "Inactive" | "Disabled";

export interface Camera {
  id: string;
  userId: string;
  name: string;
  /** IP:port or full URL entered by the user. */
  ip: string;
  status: DeviceStatus;
  createdAt?: Timestamp;
}

export type DetectionType = "Weapon" | "Gun" | "Violence" | "Stranger" | string;

export interface Detection {
  id: string;
  userId: string;
  deviceName?: string;
  type: DetectionType;
  priority?: "High" | "Medium" | "Low" | string;
  status?: "new" | "reviewed";
  /** Legacy/base64 snapshot (data URI). */
  imageUrl?: string;
  /** Firebase Storage path, when Storage is enabled. */
  imagePath?: string;
  timestamp?: Timestamp;
}

export interface TrustedPerson {
  id: string;
  homeownerId: string;
  name: string;
  relation: string;
  image?: string;
  createdAt?: Timestamp;
}

export type EmergencyStatus = "open" | "acknowledged" | "resolved";

export interface EmergencyAlert {
  id: string;
  userId: string;
  userIdentifier?: string;
  status: EmergencyStatus | "UNREAD" | "READ";
  type: "PANIC_BUTTON";
  priority: "CRITICAL";
  timestamp?: Timestamp;
  acknowledgedBy?: string;
  acknowledgedAt?: Timestamp;
  resolvedAt?: Timestamp;
}
