# Shared UI API

Import cards, modal, toasts and their prop types from `src/components`; import Header/AppLayout from `src/layout` and ThemeProvider/ThemeToggle/useTheme from `src/theme`.

A router must wrap Header/AppLayout and DeckCard. A ThemeProvider must wrap ThemeToggle/useTheme. A ToastProvider must wrap useToast. AppLayout accepts the frozen AuthState and callbacks; no component owns authentication, subscriptions or route enforcement. Member/admin visibility follows the supplied state. `actions` on Header and DeckCard and `footer` on AppLayout/Modal are caller-owned composition slots. Callers supply native, accessible controls in card action slots.

DeckCard accepts a complete frozen Deck, optional caller-provided `coverUrl` (which takes precedence over `deck.cover`), optional actions and opt-in rejected-note display. Title links navigate to `/s/:id`. Binary JPEG/WebP covers create and revoke component-owned object URLs; invalid/empty covers show a textual accessible fallback. Data dates must be valid Date objects as required by the frozen contract.

Modal is controlled by `open`/`onClose`, uses a native dialog portal and supports one active dialog at a time. Consumers serialize dialog requests; nested/concurrent dialogs are unsupported because body scroll state and focus restoration assume a single active dialog. Optional `initialFocus` points to a connected descendant. Backdrop dismissal defaults off; `closeOnBackdrop` explicitly enables it. Escape and the visible close control request `onClose`; the caller must update `open`. Small-screen content scrolls within the body.

`useToast().notify({message, kind?, duration?})` returns a stable ID within the provider. `dismiss(id)` removes it. Info/success default to 4000ms, pause on hover/focus and resume with remaining time. Duration <=0 makes these persistent. Errors always persist until dismissal, including when a duration is supplied. Messages announce through status/alert without moving focus. Removal/unmount clears timers.

Theme API exposes `theme`, `preference`, `setPreference('light'|'dark'|'system')` and `toggle()`. Explicit choices use the exact `vektor-theme` key; system removes that key. Storage failures preserve in-memory selection. System changes affect resolved theme while following system; external storage changes synchronize providers. Dataset and color-scheme update together. Foundation global styles must be loaded by the integrating application. New CSS imports contain scoped overrides only; root bootstrap integration belongs to L09.
