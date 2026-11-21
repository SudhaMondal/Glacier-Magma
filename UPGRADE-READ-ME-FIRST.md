# Glacier & Magma — upgraded source package

This package restores the npm workspace layout that was flattened in the uploaded ZIP and applies an second visual-and-audio upgrade.

## Included in this update
- Explicit lobby choices for online human-vs-human, AI opponent, and one-player/two-sides offline play.
- A new original 64-second looping fantasy ambient soundtrack (OGG) with slow evolving string-like pads, celesta/harp-like notes, soft airy texture, and a seamless loop. The game crossfades it in and retains a procedural fallback.
- Distinct horse canter, elephant trumpet/breath, and wooden oar/water splash cues now trigger on the matching knight, elephant-bishop, and ship-rook moves.
- A substantial fantasy-figurine redesign: an elegant armored queen with gown, cape, hair and crown; a crowned warrior king with cuirass and beard; a fully barded warhorse knight; a broad-eared elephant guardian with animated trunk and tusks; a sailing war-barge rook with animated oars; and armored sentinel pawns. Metallic trims, gemstones, faces and layered silhouettes are included.
- Reconstructed `shared/`, `server/`, and `client/` workspace directories from the flattened source files in the supplied archive.
- GitHub Actions CI and Pages deployment workflows.

## Important limitations
- The new creature/boat sounds are synthesized with Web Audio, not recordings of real animals or boats.
- The pieces are custom procedural Three.js 3D models rather than externally sculpted GLB files. They are designed as recognizable fantasy characters and animate in-game; they are not photorealistic human scans.
- Online multiplayer still requires the separate server to be deployed and `GAME_SERVER_URL` configured as described in `DEPLOY.md`.
- The supplied ZIP did not contain the original workspace folders. The package layout has been reconstructed from the flattened source files and workspace manifests that were included. Run the validation commands below before publishing. This V2 folder is separate from the earlier `Glacier-Magma-Upgrade/` folder so you can add it without overwriting any files.

## Validate locally
Requires Node.js 20+:
```bash
npm ci
npm run typecheck
npm test
npm run build
```

If these commands pass, push the complete folder to the existing GitHub repository. Set GitHub Pages source to **GitHub Actions**. For online play, deploy the server and add repository variable `GAME_SERVER_URL`.

## Safety
This is a full reconstructed project archive. Keep a backup of your current GitHub repository before publishing it. Do not upload only individual source files to the Pages root; publish through the included workflow.
