# Library feature

Wrap library/admin routes in the shared `ToastProvider`. Mutation outcomes use keyed transient notifications, including inside native confirmation dialogs; list loading errors retain their contextual retry panels.

`LibraryPage({auth, service})` and `MyDecksPage({auth, service})` are typed exports for L09 route composition at `/` and `/benim`. Wrap them in the shared router, load foundation styles, and place them inside AppLayout. They do not own Firebase authentication or root routing.

Only an authenticated member mounts a read session. Sessions are keyed by UID, admin role and service identity; layout cleanup invalidates asynchronous work during a change/unmount, and old cards/modals disappear in that same commit. Keep dependency objects stable between unrelated renders.

Published metadata is fetched by draining the frozen typed pagination exactly once per session (or explicit retry). The merged cards are deduplicated and sorted newest first. Search uses Turkish lowercasing of title, description and author entirely in render, including metadata from later pages. No card loads chunks or contains an iframe. Explicit retry restarts the archive scan after a failure.

Own decks query only the current UID and filter returned ownership before rendering. Pagination keeps updated order and exposes all statuses and owner-visible reject notes. Viewer/edit anchors use the frozen routes. Owner deletion is available for pending/rejected/unpublished; published deletion requires admin. Shared confirmation Modal restores focus and can be closed using Escape while idle. Operations synchronously lock duplicate submissions, preserve recoverable error dialogs, refresh after success, and discard late results after session invalidation. Firestore service/rules retain final authority.

Focused skill decisions: keyboard focus/modal guidance uses the shared Modal with explicit initial focus and Chromium keyboard trap/restore assertions; error recovery preserves the dialog; async cleanup guidance uses layout lifetime invalidation and request generations (`session.ts`, `useDeckPages.ts`, `useDeckMutation.ts`). All controls and CSS stay feature scoped.
