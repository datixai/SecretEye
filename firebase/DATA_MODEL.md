# SecretEye data model (Cloud Firestore)

| Collection | Doc ID | Written by | Key fields |
|---|---|---|---|
| `users` | Auth uid | app (signup/profile), admin | `fullName`, `email`, `phoneNumber`, `address`, `role` (`homeowner` \| `admin`), `faceReference` (JPEG data URI / base64), `disabled`, `createdAt` |
| `settings` | Auth uid | app | `armed`, `weaponEnabled`, `violenceEnabled`, `faceEnabled` (legacy: `isFaceEnabled`, `isWeaponAlertEnabled`) |
| `devices` | auto | app, admin | `userId`, `name`, `ip` (IP:port, URL or rtsp://), `status` (`Active` \| `Inactive` \| `Disabled`), `createdAt` |
| `detections` | auto | backend | `userId`, `deviceName`, `type` (`Weapon` \| `Gun` \| `Violence` \| `Stranger`), `priority`, `status` (`new` \| `reviewed`), `imageUrl` (JPEG data URI) or `imagePath` (Storage, future), `timestamp` |
| `trusted_visitors` | auto | app | `homeownerId`, `name`, `relation`, `image` (data URI), `createdAt` |
| `emergency_alerts` | auto | app (create/cancel), admin (handle) | `userId`, `userIdentifier`, `type`=`PANIC_BUTTON`, `priority`=`CRITICAL`, `status` (`open` \| `acknowledged` \| `resolved`; legacy `UNREAD`/`READ`), `timestamp`, `acknowledgedBy`, `acknowledgedAt`, `resolvedAt`, `cancelledByUser` |

## Roles
- **Homeowner** — the only role that can use the mobile app; sees only their own documents.
- **Admin** — uses the admin website. To make someone an admin, an existing admin promotes them on the *Admins* page (or set `role: "admin"` on their `users` doc in the Firebase console).

## Images
Firebase Storage is not enabled on the project (it needs the Blaze plan), so snapshots and photos are stored as compressed JPEG data URIs inside documents (≈30–60 KB each). Both apps also understand `imagePath` so moving to Storage later only needs a backend change.

## Deploying rules
```bash
npm install -g firebase-tools
firebase login
cd firebase
firebase deploy --only firestore
```
