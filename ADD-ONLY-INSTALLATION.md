# Add-only installation — Glacier & Magma Upgrade

This archive is designed to be ADDED to your existing GitHub repository. It does not ask you to delete or overwrite the old project files.

## Upload
1. Extract this ZIP on your computer.
2. Open your existing GitHub repository.
3. Click **Add file -> Upload files**.
4. Drag in the `Glacier-Magma-Upgrade` folder AND the `.github` folder from the extracted archive.
5. Commit the upload.

The new game source lives under `Glacier-Magma-Upgrade/`. The new GitHub Actions workflow is:
`.github/workflows/deploy-glacier-magma-upgrade.yml`

## Publish
1. Open repository **Settings -> Pages**.
2. Set **Build and deployment -> Source** to **GitHub Actions**.
3. Open the **Actions** tab.
4. Select **Deploy Glacier & Magma Upgrade (add-only)** and wait for a green check.

The workflow builds from the new folder and publishes `Glacier-Magma-Upgrade/client/dist`. The old root-level files are left untouched.

## Online play
The AI and local two-sided modes do not need a server. Real online matches require the existing server deployment. Add a repository Actions variable named `GAME_SERVER_URL` with the deployed server's HTTPS URL. If the server is not deployed yet, the online option will not connect; local modes still work.

## Validation note
The original uploaded archive had the workspace source flattened. This ZIP reconstructs the expected `shared/`, `server/`, and `client/` directories from the files/manifests in that archive. I could not complete `npm ci` in the preparation environment because it could not reach `registry.npmjs.org` (DNS/network unavailable). GitHub Actions will perform dependency installation and build in its hosted runner and show any compile errors in the workflow log.
