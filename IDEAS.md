# Ideas & Improvements

## Mobile

- [ ] Menu/back button exits fullscreen on mobile (tap menu → `document.exitFullscreen()`)
- [ ] Map the engine's quit/exit action to return to the start screen instead of closing — intercept the exit event from the WASM module and reload or show the setup overlay again

## Setup

- [ ] Split "Reset game data" into two actions: one that only deletes the imported game files (OPFS `vcbr`, `vcsky`, `_game_ready`), e.g. to clean up a broken or half-finished import, and one that also deletes saves and skins (IndexedDB). Today the single button always wipes saves too, even when the user only wants to re-import
