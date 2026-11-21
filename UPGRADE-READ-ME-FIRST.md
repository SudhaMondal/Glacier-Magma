# Glacier & Magma — upgraded source package

This package restores the npm workspace layout that was flattened in the uploaded ZIP and applies an initial feature upgrade.

## Included in this update
- Explicit lobby choices for online human-vs-human, AI opponent, and one-player/two-sides offline play.
- A softer ambient music bed: consonant pentatonic notes, slow sustained pads, quieter ambience, and no recurring taiko/combat drum pattern.
- Procedural horse canter, elephant-trumpet, and wooden-oar/water sound cues tied to knight, bishop-elephant, and rook-barge moves.
- Additional 3D model detailing: metallic trim, crown points, gems, elephant ears/tusks/trunk, and knight eye details.
- Reconstructed `shared/`, `server/`, and `client/` workspace directories from the flattened source files in the supplied archive.
- GitHub Actions CI and Pages deployment workflows.

## Important limitations
- The new creature/boat sounds are synthesized with Web Audio, not recordings of real animals or boats.
- The pieces are still procedural Three.js models. This is an art-direction upgrade, not professionally sculpted external GLB character assets.
- Online multiplayer still requires the separate server to be deployed and `GAME_SERVER_URL` configured as described in `DEPLOY.md`.
- The supplied ZIP did not contain the original workspace folders. The package layout has been reconstructed from the flattened source files and workspace manifests that were included. Run the validation commands below before publishing.

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
