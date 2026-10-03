# Architecture & Security Contracts Specification

This document records the frozen security contracts, data models, Firestore security rules, composite indexes, quota transaction mechanics, access-call budget arithmetic, and CSP sandbox validation established in Lane L02 (`work/security-contracts`).

---

## 1. Executive Summary & Lane L02 Contract Freeze

Lane L02 freezes the backend data layer and shared contract surface across the application:
- **Zero Server Cost:** Entire compute lifecycle runs client-side; binary payloads are gzip-compressed or raw identity, sliced into canonical decimal chunks, and committed directly to Cloud Firestore.
- **Strict Role Boundaries:** Signed-out visitors see zero private decks; members (Google OAuth or verified email) manage their own decks; admins (verified via console-only marker documents `admins/{uid}`) manage queue review, approvals, rejections, and published deletions.
- **Quota & Integrity Enforcement:** Server-side atomic invariants guarantee a 5-pending-deck limit per user, two-way transaction binding using `getAfter()`, chunk byte-length manifest matching, and orphan/tail cleanup.
- **Strict Sandboxing:** Presentation execution strictly isolates third-party code in `allow-scripts allow-fullscreen` (theater/preview) or `allow-scripts` (cover capture) sandboxes with no `allow-same-origin`, no `allow-popups`, and inherited CSP protection.

All contracts exported in `src/contracts/**` are canonical and binding for lanes L03 through L09.

---

## 2. Firestore Data Model & Collection Schema

### 2.1 Collection: `users/{uid}`
Tracks user identity and active submission quotas.
- `displayName` (`string`, max 100): User's profile name.
- `email` (`string`, immutable after creation): User's authenticated email.
- `createdAt` (`timestamp`, immutable): Account creation timestamp.
- `pendingCount` (`int`, 0 to 5): Number of decks currently awaiting admin review.
- `pendingDeckId` (`string`, optional): Document ID of the presentation bound to the most recent quota transaction.

**Rules Invariant:**
- Documents are never listable by members.
- Members can only read their own profile (`isOwner(uid)`).
- Admin can read user profiles for review audits.

### 2.2 Collection: `admins/{uid}`
Console-only authorization marker documents.
- Client writes: **Denied unconditionally (`allow write: if false;`)**.
- Verification: Existence check `exists(/databases/$(database)/documents/admins/$(request.auth.uid))` grants admin authority.
- No admin email address or identifier literal is ever committed to source code.

### 2.3 Collection: `presentations/{id}`
Core presentation metadata and chunk manifest document.
- `ownerUid` (`string`, immutable): Firebase Auth UID of the creator.
- `ownerName` (`string`, optional): Creator display name at time of upload.
- `ownerPhotoURL` (`string`, optional): Creator avatar URL if available.
- `title` (`string`, 1 to 120 chars): Deck title.
- `description` (`string`, up to 2000 chars): Deck description or abstract.
- `links` (`list`, max 10 items): Array of external links, each map containing:
  - `label` (`string`, 1 to 100 chars)
  - `url` (`string`, max 1000 chars, must match `^https://.+`)
- `kind` (`string`): Enum `'html' | 'pptx'`.
- `fileName` (`string`, 1 to 255 chars): Name of original file or bundle.
- `status` (`string`): Enum `'pending' | 'published' | 'rejected' | 'unpublished'`.
- `rejectNote` (`string`, max 1000 chars): Note explaining rejection reason. Required and non-empty when status is `'rejected'`.
- `cover` (`bytes`, max 150,000 bytes): Binary thumbnail bytes (WebP or JPEG). Indexing disabled.
- `coverSource` (`string`): Enum `'auto' | 'upload' | 'default'`.
- `sizes` (`map`):
  - `encoded` (`int`, > 0): Gzip-compressed (HTML) or raw (PPTX) total size. Capped at 5,242,880 bytes (5 MB) for HTML and 8,388,608 bytes (8 MB) for PPTX.
  - `unpacked` (`int`, >= 0): Uncompressed size (browser-validated).
  - `fileCount` (`int`, >= 1): Total files in bundle (browser-validated).
- `chunkCount` (`int`, 1 to 12): Number of chunk documents in subcollection `chunks`.
- `chunks` (`list` of maps): Manifest array of length `chunkCount`. Each element has:
  - `index` (`int`, 0 to 11): Zero-based sequential chunk index.
  - `size` (`int`, 1 to 900,000): Exact byte length of the corresponding chunk payload.
- `createdAt` (`timestamp`, immutable): Creation timestamp.
- `updatedAt` (`timestamp`): Last updated timestamp.
- `publishedAt` (`timestamp` or `null`): Publication timestamp set by admin upon approval.
- `reviewedBy` (`string` or `null`): UID of reviewing admin.
- `reviewedAt` (`timestamp` or `null`): Timestamp of admin review action.
- `manifestVersion` (`int`, constant 1): Schema version identifier.
- `quotaMarker` (`string`): Binding token equal to deck ID, guaranteeing two-way quota locking.

### 2.4 Subcollection: `presentations/{id}/chunks/{chunkIndex}`
Binary storage for chunked presentation content.
- Document ID: Decimal string representation of zero-based index (`"0"`, `"1"`, ...).
- `index` (`int`): Matching integer index (`0`, `1`, ...).
- `data` (`bytes`): Binary payload segment (max 900,000 bytes). Indexing disabled.

---

## 3. Firestore Security Rules Decision Matrix

| Resource | Operation | Caller Role | Condition / Invariant | Result |
|---|---|---|---|---|
| `users/{uid}` | `list` | Any | Collection listing prohibited | **DENIED** |
| `users/{uid}` | `get` | Anonymous | Must be authenticated | **DENIED** |
| `users/{uid}` | `get` | Member | `request.auth.uid == uid` (Own profile) | **ALLOWED** |
| `users/{uid}` | `get` | Member | Other member's profile | **DENIED** |
| `users/{uid}` | `get` | Admin | Admin audit read | **ALLOWED** |
| `users/{uid}` | `create` | Member | Self-creation with pendingCount=0 or atomic pendingCount=1 | **ALLOWED** |
| `users/{uid}` | `update` | Member | Direct counter modification outside atomic batch | **DENIED** |
| `users/{uid}` | `update` | Member | Bound counter increment/decrement matching deck `getAfter` | **ALLOWED** |
| `admins/{uid}` | All writes | Any | Client write prohibited | **DENIED** |
| `presentations/{id}` | `get` | Anonymous | `status == 'published'` | **ALLOWED** |
| `presentations/{id}` | `get` | Anonymous | `status != 'published'` | **DENIED** |
| `presentations/{id}` | `get` | Member | Non-published deck owned by other member | **DENIED** |
| `presentations/{id}` | `get` | Member | Own deck (any status) | **ALLOWED** |
| `presentations/{id}` | `get` | Admin | Any deck (any status) | **ALLOWED** |
| `presentations/{id}` | `create` | Member | Directly sets `status: 'published'` | **DENIED** |
| `presentations/{id}` | `create` | Member | Unwhitelisted field or invalid type | **DENIED** |
| `presentations/{id}` | `create` | Member | Valid pending deck + 2-way user quota increment | **ALLOWED** |
| `presentations/{id}` | `update` | Member | Tries to modify `ownerUid` or `createdAt` | **DENIED** |
| `presentations/{id}` | `update` | Member | Edits own pending deck (pending → pending, counter unchanged) | **ALLOWED** |
| `presentations/{id}` | `update` | Member | Edits published/rejected deck back to pending (+1 quota) | **ALLOWED** |
| `presentations/{id}` | `update` | Admin | Sets `status: 'published'` or `'rejected'` with review metadata | **ALLOWED** |
| `presentations/{id}` | `delete` | Member | Deletes own published deck | **DENIED** |
| `presentations/{id}` | `delete` | Member | Deletes own pending deck (-1 quota) | **ALLOWED** |
| `presentations/{id}` | `delete` | Admin | Deletes published or review queue deck | **ALLOWED** |
| `chunks/{index}` | `get` | Anonymous | Parent deck `status == 'published'` | **ALLOWED** |
| `chunks/{index}` | `get` | Member | Parent deck is pending and owned by other member | **DENIED** |
| `chunks/{index}` | `create` | Member | Chunk byte length != manifest `size` | **DENIED** |
| `chunks/{index}` | `create` | Member | Valid chunk matching manifest entry | **ALLOWED** |
| `chunks/{index}` | `delete` | Member | Parent deck deleted in batch OR tail cleanup (`index >= chunkCount`) | **ALLOWED** |

---

## 4. Quota Contract & Two-Way Transaction Design

### 4.1 The Two-Way Binding Problem
Simple checks of `pendingCount + 1` permit race conditions and forged writes:
1. An attacker could craft an atomic batch that creates two presentations (`deckA` and `deckB`) while incrementing `pendingCount` by only 1.
2. An attacker could unilaterally increment `pendingCount` without creating any deck, causing drift.
3. An attacker could attempt to edit an existing pending deck and falsely consume another slot or fail unexpectedly.

### 4.2 Two-Way Binding Solution
To make quota state transitions strictly provable and non-bypassable, both documents lock each other in BOTH directions using `getAfter()`:

```
[ presentations/{deckId} ]                     [ users/{ownerUid} ]
  - status: 'pending'                            - pendingCount: countBefore + 1 (<= 5)
  - quotaMarker: deckId                          - pendingDeckId: deckId
         |                                              |
         +---------> verifies userAfter.pendingDeckId == deckId <---+
         |           verifies userAfter.pendingCount <= 5           |
         |                                                          |
         +-- verifies deckAfter.ownerUid == ownerUid <--------------+
             verifies deckAfter.status == 'pending'
             verifies deckAfter.quotaMarker == pendingDeckId
```

### 4.3 Proven Invariants
- **Multi-Deck Creation Rejection:** Because `users/{uid}.pendingDeckId` can only hold a single deck ID per transaction, creating two decks in one batch causes the second deck to fail `userAfter.pendingDeckId == deckId`.
- **Pending Edit Invariance:** Editing a deck that is already in `pending` status checks `userAfter.pendingCount == userBefore.pendingCount`. Counter modification is forbidden.
- **Re-review Transition:** Editing a `published`, `rejected`, or `unpublished` deck forces its status back to `pending`. Security rules verify that `userAfter.pendingCount == userBefore.pendingCount + 1`, consuming a pending quota slot.
- **Slot Release on Review / Delete:** Admin approval, admin rejection, admin deletion, or owner deletion of a pending deck requires `userAfter.pendingCount == userBefore.pendingCount - 1`.

---

## 5. Chunk Manifest & Access-Call Budget Arithmetic

### 5.1 Cloud Firestore Access-Call Limit
Cloud Firestore Security Rules enforce a hard limit of **at most 10 `get()` / `exists()` / `getAfter()` / `existsAfter()` calls per evaluation context**.

### 5.2 Arithmetic Proof Against Monolithic Parent Inspection
If the parent deck document rule attempted to verify all 12 chunks directly:
$$\text{Access Calls} = 12 \times \text{getAfter(chunk)} = 12 \text{ calls} > 10 \text{ limit}$$
This would cause a runtime rules evaluation error on any presentation having more than 9 chunks.

### 5.3 Decentralized Verification Architecture
Instead of verifying child chunks from the parent rule, verification is decentralized:
1. **Parent Deck Evaluation:**
   - Manifest array format and size sum are validated purely using in-memory helper functions (`sumChunkSizes`, `areValidManifestEntries`).
   - Access calls on parent deck:
     $$\text{Calls}_{\text{deck}} = 1\ (\text{getAfter}(\text{users})) + 1\ (\text{get}(\text{users})) = 2 \le 10$$
2. **Individual Chunk Evaluation (`chunks/{chunkIndex}`):**
   - Each chunk document is evaluated independently in its own rule context.
   - It performs exactly one `getAfter()` to read the parent manifest:
     $$\text{Calls}_{\text{chunk}} = 1\ (\text{getAfter}(\text{presentations})) = 1 \le 10$$
   - It asserts:
     $$\text{request.resource.data.data.size}() == \text{deckAfter.chunks}[\text{request.resource.data.index}].\text{size}$$
3. **Atomic Batch Guarantee:**
   Because all chunks and the parent deck are committed in a single atomic batch, if even a single chunk payload disagrees with the manifest entry, the entire transaction rolls back.

Total access calls per document evaluation never exceeds 2, preserving an 80% safety margin below the Firestore 10-call ceiling.

### 5.4 Tail Cleanup and Orphan Cleanup
- **Orphan Cleanup:** When deleting a deck, chunks can be deleted in the same batch because chunk delete rules verify `!existsAfter(deckPath)`.
- **Tail Cleanup:** When updating a presentation with fewer chunks (e.g., from 8 chunks down to 5 chunks), chunks 5, 6, and 7 are permitted to be deleted because the chunk delete rule validates:
  $$\text{int}(\text{chunkIndex}) \ge \text{deckAfter}.\text{chunkCount}$$

---

## 6. Composite Indexes & Field Overrides

Configured in `firestore.indexes.json`:

### 6.1 Composite Indexes
1. **Published Feed:**
   - Collection: `presentations`
   - Fields: `status` ASC, `publishedAt` DESC
   - Consumed by: `/` home feed query, cursor pagination.
2. **Member Decks:**
   - Collection: `presentations`
   - Fields: `ownerUid` ASC, `updatedAt` DESC
   - Consumed by: `/benim` personal management dashboard.
3. **Admin Review Desk:**
   - Collection: `presentations`
   - Fields: `status` ASC, `createdAt` ASC
   - Consumed by: `/admin` queue, FIFO review ordering.

### 6.2 Binary Field Index Exemptions
To prevent index bloat, storage costs, and indexation failure on large binary payloads:
- `presentations.cover`: Indexing disabled (`indexes: []`).
- `presentations.chunks`: Indexing disabled (`indexes: []`).
- `chunks.data`: Indexing disabled (`indexes: []`).

---

## 7. System Limits & Sizing Standards

| Limit Parameter | Rules Hard Cap | TypeScript Constant | Client / Browser Invariant |
|---|---|---|---|
| Max Pending per User | 5 | `MAX_PENDING_PER_USER = 5` | Upload blocked in UI when `pendingCount >= 5` |
| Max Title Length | 120 chars | `MAX_TITLE_LENGTH = 120` | Form validation max 120 chars |
| Max Description Length | 2000 chars | `MAX_DESCRIPTION_LENGTH = 2000` | Form validation max 2000 chars |
| Max Resource Links | 10 | `MAX_LINKS_COUNT = 10` | UI allows up to 10 link items |
| Max Link Label Length | 100 chars | `MAX_LINK_LABEL_LENGTH = 100` | Input maxlength 100 |
| Max Link URL Length | 1000 chars | `MAX_LINK_URL_LENGTH = 1000` | Input maxlength 1000, `https:` only |
| Cover Thumbnail Bytes | 150,000 bytes | `MAX_COVER_BYTES = 150000` | Client resizes to 640px JPEG/WebP (~100 KB) |
| Max Chunks per Deck | 12 | `MAX_CHUNKS_COUNT = 12` | Bundler slices into <= 12 chunks |
| Max Chunk Payload | 900,000 bytes | `MAX_CHUNK_BYTES = 900000` | Chunk slicing threshold 900 KB |
| Max Encoded HTML Size | 5,242,880 bytes (5 MB) | `MAX_HTML_ENCODED_BYTES = 5242880` | Gzip stream output validation |
| Max PPTX Size | 8,388,608 bytes (8 MB) | `MAX_PPTX_BYTES = 8388608` | Raw PPTX file size validation |
| Max Unpacked HTML Size | Not checked in rules | `MAX_HTML_UNPACKED_BYTES = 26214400` | Client-only check before processing (25 MB) |
| Max Files in HTML Bundle| Not checked in rules | `MAX_HTML_FILE_COUNT = 300` | Client-only check before processing (300) |

*Note on Operator Decision 3:* Rules enforce ONLY compressed/encoded size, chunk count, field types, and sizes. Unpacked size and file count are strictly client-side browser checks; rules do not attempt to validate them.

---

## 8. Sandboxed Iframe Rendering & Real-Browser CSP POC

The CSP behavior for sandboxed presentation viewing was verified via real-browser test in Chromium (`tests/rules/csp-poc.spec.ts`).

### 8.1 Sandbox Attribute Constraints
- **Theater and Upload Preview:** `sandbox="allow-scripts allow-fullscreen"`
- **Hidden Cover Capture:** `sandbox="allow-scripts"`
- **Forbidden Tokens:** `allow-same-origin` and `allow-popups` are **strictly prohibited**. Uploaded presentations cannot access parent DOM, parent cookies, local storage, or spawn unauthorized popups.

### 8.2 Real App CSP Policy
Served via Hosting configuration:
```
default-src 'self'; base-uri 'self'; object-src 'none'; form-action 'self' https://*.google.com; frame-ancestors 'none'; script-src 'self' 'unsafe-inline' data: blob: https:; style-src 'self' 'unsafe-inline' data: blob: https:; img-src 'self' data: blob: https:; font-src 'self' data: blob: https:; media-src 'self' data: blob: https:; connect-src 'self' https: wss:; frame-src 'self' blob: data: https://*.firebaseapp.com https://*.google.com https://*.googleapis.com;
```

### 8.3 POC Verification Results
- **Inline Script & CSS Execution:** Sandboxed `srcdoc` iframe executes inline script and renders styled presentation elements without violation under the app CSP.
- **Data-URI Scripts:** Inlined modular scripts (`data:text/javascript,...`) execute cleanly.
- **Blob URL Scripts:** Dynamically created object URLs (`blob:...`) execute cleanly.
- **Insecure Resource Blocking:** Script tags referencing `http://` resources are strictly blocked.
- **Negative Control:** When parent document is served with `script-src 'none'`, child script execution within the `srcdoc` frame is blocked, confirming CSP inheritance.

---

## 9. Sequential Changes Required (Handoff to Subsequent Lanes)

The following edits were made outside Lane L02's initial write scope under the prompt's authorized exception:

1. **`firebase.json`:**
   - **Reason:** `firebase.json` was missing the `firestore` and `emulators` blocks, causing `firebase-tools emulators:exec --only firestore` to abort with `Error: No emulators to start`.
   - **Change Applied:** Added minimal `firestore` declarations (`rules: "firestore.rules"`, `indexes: "firestore.indexes.json"`) and `emulators.firestore` configuration (`port: 8080`).
   - **`package.json` Status:** Untouched. `npm run test:rules` invoked the existing script and executed successfully without changes.

### Directives for Downstream Lanes:
- **Lane L03 (`work/auth-data`):**
  - Must consume models and services from `src/contracts/**`.
  - Must write presentations and user quota updates in a single atomic batch/transaction conforming to the two-way `quotaMarker` / `pendingDeckId` schema.
  - Must return `Result<T>` structures from all data service methods; never throw raw errors to UI.
- **Lane L04 (`work/content-pipeline`):**
  - Must validate client-only limits (`MAX_HTML_UNPACKED_BYTES`, `MAX_HTML_FILE_COUNT`) before initiating compression or chunking.
  - Must generate chunk manifests matching `ChunkManifestEntry[]` where sum of chunk sizes exactly equals `sizes.encoded`.
- **Lane L06 (`work/viewer`) & L08 (`work/upload-edit`):**
  - Theater viewer iframe must use exactly `sandbox="allow-scripts allow-fullscreen"`.
  - Hidden capture iframe must use exactly `sandbox="allow-scripts"`.
