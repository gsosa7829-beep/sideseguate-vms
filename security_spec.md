# Security Specification (`security_spec.md`)

## 1. Data Invariants
1. **Global Default Deny**: Any path not explicitly matched in `firestore.rules` is unconditionally denied (`allow read, write: if false;`).
2. **Verified Identity for Private Workspaces**: `/admins/{adminId}` and `/vms_workspaces/{workspaceId}` require `request.auth != null && request.auth.token.email_verified == true`.
3. **Admin & Workspace Oracle-Free Isolation**: `/admins/{adminId}` and `/vms_workspaces/{workspaceId}` only allow `get` when authenticated as the owner (`adminId == request.auth.uid` / `existing().ownerId == request.auth.uid`, or `workspaceId == request.auth.uid` when `resource == null`) or verified admin (`gsosa7829@gmail.com`).
4. **Workspace Ownership & Immutability**: `/vms_workspaces/{workspaceId}` requires `workspaceId == request.auth.uid`, `incoming().ownerId == request.auth.uid`, strict key allowlists (`hasAll` + `hasOnly`), immutable `ownerId` and `createdAt`, server timestamps (`request.time`), and terminal state locking when `existing().status == 'archived'` (unless `isAdmin()`).
5. **Cloud Shared Links & Camera Synchronization (`/cloud_projects`, `/cloud_cameras`, `/cloud_share_links`, `/cloud_access_logs`)**:
   - Every document ID (`{projectId}`, `{cameraId}`, `{token}`, `{logId}`) must pass `isValidId()` (`1..128` chars, `^[a-zA-Z0-9_\-]+$`) and match `incoming().id` (or `incoming().token` for `/cloud_share_links/{token}`).
   - `ownerId` is scoped to authorized operators (`isAuthorizedOperator(ownerId)`), remains immutable across updates, and is enforced on `list` queries (`isAuthorizedOperator(existing().ownerId)`). `tenantId` is locked once present on existing documents.
   - `/cloud_cameras` forbids persisting legacy DVR credentials (`username`, `password`, `rtspUrl`, `verificationCode`) except one-time cleanup deletion via `deleteField()`. `hlsStreamUrl` and `webrtcUrl` reject `javascript:` / `data:` / non-relative URIs (`isValidStreamUrl`).
   - `/cloud_share_links` Action 1 (viewer telemetry) bounds `accessCount` monotonically (`existing().accessCount .. existing().accessCount + 1`) and enforces ISO 8601 `lastAccessedAtIso`.
   - `/cloud_access_logs` is append-only for clients (`allow update: if false`), and `delete` is restricted to `isAdmin()`.
6. **Delegated Sub-Users (`/cloud_sub_users/{userId}`)**:
   - Enforces strict 19-field `hasAll` + `hasOnly` schema (`isValidCloudSubUser`), `userId == incoming().id`, `role in ['engineer', 'operator']` (blocks `'superadmin'`), `username != 'admin'`, `email == '' || isValidEmail(email)`, `allowedProjectIds` max 100 items, integer `hashIterations` in `1000..1000000`, `hashAlgorithm in ['PBKDF2-SHA256', 'LEGACY-FALLBACK']`, and immutable `id`, `ownerId`, `tenantId`, `createdAtIso`, `createdAt`.
   - Architectural note: `/cloud_*` collections retain `isTenantOwnerId` fallback until operators and public share-link viewers are migrated to Firebase Authentication / Cloud Functions.

## 2. The "Dirty Dozen" Payloads
1. **Unauthenticated Private Workspace Write**: `auth = null` writing to `/vms_workspaces/user_1` -> `PERMISSION_DENIED`.
2. **Unverified Email Spoof**: `auth = { uid: 'u1', token: { email: 'gsosa7829@gmail.com', email_verified: false } }` -> `PERMISSION_DENIED`.
3. **Identity Spoofing on Create**: `auth.uid = 'u1'` writing `ownerId: 'u2'` to `/vms_workspaces/u1` -> `PERMISSION_DENIED`.
4. **Path Mismatch on Share Link Create**: Writing `token: 'sdg_live_other'` to `/cloud_share_links/sdg_live_token1` -> `PERMISSION_DENIED`.
5. **Shadow Field Injection**: Sending extra key `isSuperAdmin: true` to `/cloud_share_links/sdg_live_token1` or `/cloud_cameras/cam_1` -> `PERMISSION_DENIED`.
6. **ID Poisoning (1.5KB ID)**: Writing to `/cloud_share_links/<200-char-invalid-id>` -> `PERMISSION_DENIED`.
7. **String Volumetric Overflow**: Setting `rtspUrl` on `/cloud_cameras/cam_1` to a 5000-character string (`maxLength: 500`) -> `PERMISSION_DENIED`.
8. **Type Poisoning**: Setting `channel` on `/cloud_cameras/cam_1` to `"one"` instead of `int` -> `PERMISSION_DENIED`.
9. **Client Timestamp Forgery**: Setting `createdAt` or `updatedAt` on `/cloud_share_links/sdg_live_token1` to a past/future timestamp (`!= request.time`) -> `PERMISSION_DENIED`.
10. **Immortal Field Mutation**: Changing `createdAt`, `token`, `id`, or `ownerId` during `update` on `/cloud_share_links/{token}` -> `PERMISSION_DENIED`.
11. **Array Volumetric Overflow**: Setting `cameraIds` on `/cloud_share_links/{token}` to an array of 100 items (`size() > 64`) -> `PERMISSION_DENIED`.
12. **Unauthorized Cross-Workspace List**: Querying `/cloud_share_links` or `/cloud_cameras` with an unauthorized `ownerId` -> `PERMISSION_DENIED`.
