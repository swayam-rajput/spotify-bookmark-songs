# 🔖 Song Bookmark — Spicetify Extension

> Bookmark your favorite moment in any song. Spotify will automatically skip to it every time the track plays.

## Features

- 📌 **Drag-to-bookmark** — drag the pin icon onto the progress bar to set a timestamp
- ⚡ **Auto-seek** — on song start, automatically jumps to your saved spot
- 🟢 **Visual marker** — a glowing dot on the progress bar shows where your bookmark is
- 🗑 **Hover to remove** — hover over the marker dot to get a remove option
- 💾 **Persistent storage** — bookmarks are saved in `localStorage` per Spotify track URI
- 🎵 **Per-song, per-user** — each song gets its own independent bookmark

## How to Use

1. **Set a bookmark**: Drag the 📌 pin icon (in the player controls) onto the progress bar at any position. A tooltip will ask you to confirm.
2. **Auto-play from bookmark**: The next time that song plays, it will automatically seek to your saved spot.
3. **See your bookmark**: A glowing green dot appears on the progress bar at the bookmarked position.
4. **Remove a bookmark**: Hover over the green dot → click **Remove**.
5. **Update a bookmark**: Drag the pin icon again to a new position and save.

## Installation

### Via Spicetify Marketplace
Search for **"Song Bookmark"** in the Marketplace extensions tab.

### Manual Install
```bash
# Copy the extension to your Spicetify extensions folder
copy songBookmark.js %APPDATA%\spicetify\Extensions\

# Enable it
spicetify config extensions songBookmark.js
spicetify apply
```

## Storage

Bookmarks are stored in your browser's `localStorage` under the key `SongBookmark:bookmarks`.  
Format: `{ "spotify:track:<id>": <milliseconds> }`

You can export/import them via your browser's DevTools console:
```js
// Export
copy(localStorage.getItem("SongBookmark:bookmarks"))

// Import
localStorage.setItem("SongBookmark:bookmarks", '<paste json here>')
```

## Contributing

PRs welcome! Please open an issue before making major changes.

## License

MIT
