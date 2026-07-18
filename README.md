# File Manager (Dungeons Lab)

I got tired of Foundry's stock File Picker. No tags, no favorites, no real way to tell your maps
apart without opening every single one. So I built a replacement.

This module swaps the core File Picker for a GM-only browser with color labels, tags, favorites,
a "recent folders" list, and live preview for images, video and audio right in the window. Drop
an audio file onto a Playlist and it creates the track for you. Drop any file onto a Journal
entry and it makes a page. There are also quick action buttons in the preview panel: place on
scene as a Tile, show to your players, send to chat, whisper to someone.

It's system agnostic, doesn't matter if you're running dnd5e, PF2e or homebrew. It's just a file
browser, works everywhere Foundry does.

## Install

Foundry VTT, Add-on Modules, Install Module, then paste the manifest URL from the
[Releases page](https://github.com/Vladimir-inc/dungeonslab-file-manager/releases). You can also
grab the zip from there and install it by hand.

Needs Foundry v13+ (built and tested on v13/v14).

## What's in it

- Grid, List, Compact and Portrait views, each file gets a small type icon
- Color labels and tags, filterable, GM-only
- Favorites and a "Recent" list in the sidebar
- Preview panel with a working audio player (seek bar included) and video/image preview
- One click from the preview panel: place on scene, show to players, send to chat, whisper
- Drag and drop into Playlists (audio) and Journal entries (any file)
- English and Russian localization

## About this repo

This is the public source for the module, same code that ships in the release, just without a
couple of bundled binary assets (the intro sound and logo) that don't belong in a source repo.

## Support

Found a bug or want a feature? Open an issue: [GitHub Issues](https://github.com/Vladimir-inc/dungeonslab-file-manager/issues).

There's also a Discord where updates get posted first: https://discord.gg/MUxsQCf587

## License

Copyright 2026 Dungeons Lab. All rights reserved, see [LICENSE](LICENSE).
Free to install and use in your own games. The source itself is not licensed for redistribution,
modifying and redistributing, or reselling without asking first.
