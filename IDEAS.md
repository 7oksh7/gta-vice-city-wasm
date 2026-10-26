# Ideas & Improvements

## Mobile

- [ ] Menu/back button exits fullscreen on mobile (tap menu → `document.exitFullscreen()`)

## Setup

- [ ] Split "Reset game data" into two actions: one that only deletes the imported game files (OPFS `vcbr`, `vcsky`, `_game_ready`), e.g. to clean up a broken or half-finished import, and one that also deletes saves and skins (IndexedDB). Today the single button always wipes saves too, even when the user only wants to re-import
