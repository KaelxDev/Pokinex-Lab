# Legacy root component audit

`MessageContextMenu.jsx` and `MobileSidebar.jsx` were retained in the root of `src` by older revisions while the active application imports the canonical components from `src/components/`.

They are removed from the source tree as part of the frontend architecture cleanup.
