# Glacier & Magma V2 — add-only upload

This is a new, separate folder and workflow. It does not require deleting or replacing the original repository files or the earlier `Glacier-Magma-Upgrade/` folder.

## Upload these two items
1. The complete `Glacier-Magma-Upgrade-V2/` folder.
2. The new workflow file at `.github/workflows/deploy-glacier-magma-upgrade-v2.yml`.

Upload them into the existing repository using **Add file → Upload files**, preserving the folder paths, then commit.

## Publish
Open the repository's **Actions** tab and run **Deploy Glacier & Magma V2 (fantasy pieces and soundtrack)** if it does not start automatically. The workflow builds the V2 folder and publishes its `client/dist` output to GitHub Pages. Keep Pages source set to **GitHub Actions**.

The earlier upgrade folder and its workflow are left in place. The V2 workflow only watches the new V2 folder and its own workflow file.

## What changed
- New 64-second original ambient music loop at `Glacier-Magma-Upgrade-V2/client/public/audio/glacier-magma-ambient.ogg`.
- Detailed 3D fantasy queen, king, horse, elephant, ship and pawn designs.
- Animated elephant trunk and ship oars.
- Knight gallop, elephant trumpet and ship rowing/water effects are connected to actual moves.

## Important validation note
I verified the edited TypeScript files parse successfully and confirmed the music asset is present. I could not complete `npm ci` in this environment because the npm registry was unreachable, so the hosted GitHub Actions build is still required before calling the V2 game published or complete. If the build fails, share the red workflow log and I can fix the exact error.

The 3D figures are custom procedural Three.js models, not third-party GLB models. The online mode still needs a deployed game server and the `GAME_SERVER_URL` repository variable; local and AI modes do not require that server.
