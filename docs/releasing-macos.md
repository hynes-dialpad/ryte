# Releasing Ryte for macOS

Ryte is distributed as a notarized Apple Silicon (`arm64`) DMG through GitHub Releases. It is not a Mac App Store build and it does not include Intel support.

## One-time Apple setup

1. Enroll in the [Apple Developer Program](https://developer.apple.com/programs/) using the organization or person that will appear as the app publisher.
2. In Apple Developer Certificates, create a **Developer ID Application** certificate. Download it, install it in Keychain Access, then export the certificate **with its private key** as a password-protected `.p12` file. Do not use an Apple Development or Mac App Distribution certificate.
3. In App Store Connect, create a **Team API key** with the App Manager role. Record its Key ID and Issuer ID. Download the `.p8` file immediately; Apple only offers it once.
4. Make the GitHub repository public if people should be able to download the DMG without a GitHub account.

## One-time GitHub setup

1. In the repository, create an Actions environment named `release`. Require approval if another person should authorize public releases.
2. Add the following **environment secrets** to `release`:

   | Secret                 | Value                                                                |
   | ---------------------- | -------------------------------------------------------------------- |
   | `CSC_LINK`             | Base64-encoded contents of the Developer ID Application `.p12` file. |
   | `CSC_KEY_PASSWORD`     | Password used when exporting that `.p12` file.                       |
   | `APPLE_API_KEY_BASE64` | Base64-encoded contents of the App Store Connect `.p8` file.         |
   | `APPLE_API_KEY_ID`     | App Store Connect API Key ID.                                        |
   | `APPLE_API_ISSUER`     | App Store Connect API Issuer ID.                                     |

   Store the file contents as secrets; do not commit certificate or API-key files, and do not paste them into issue comments or terminal history.

3. Confirm GitHub Actions can create releases. The workflow requests `contents: write`; repository settings must not restrict that permission.

## Icon asset maintenance

Ryte’s custom icon is already included. For a future refresh, provide the source as either:

- a 1024 by 1024 transparent PNG (preferred), or
- an SVG on a square canvas.

Do not bake the macOS rounded-square mask into the source artwork. Regenerate and commit the matching `app/resources/icon.png`, `app/build/icon.png`, and `app/build/icon.icns` from that source while preserving PNG transparency. The application uses the PNG for the development Dock icon; electron-builder uses the `.icns` for the packaged app and DMG.

## Local package check

An unsigned DMG is useful for checking the installer layout before credentials are configured:

```bash
pnpm dmg:local
```

The resulting file is `app/dist/ryte-<version>-arm64.dmg`. This command intentionally disables macOS code signing so the unsigned bundle remains internally consistent and launchable for local installer checks. It is not suitable for distribution. `pnpm release:mac:arm64` uses the separate signed package path and is intentionally blocked unless signing and notarization credentials are present.

## Publishing a release

1. Update `app/package.json` to the intended pre-1.0 version, such as `0.4.0`, and ensure the current icon assets are included.
2. On the release branch, run the full local check:

   ```bash
   pnpm --dir app validate
   pnpm --dir app smoke:indexer
   pnpm dmg:local
   ```

3. Open, review, merge, and sync the release change to `main`.
4. Create and push a matching annotated tag from synchronized `main`:

   ```bash
   git tag -a v0.4.0 -m "Ryte v0.4.0"
   git push origin v0.4.0
   ```

5. Approve the `release` environment when GitHub Actions requests it. The workflow builds a native Apple Silicon app, signs it with the Developer ID certificate, submits and staples notarization, verifies the app with `codesign` and Gatekeeper, uploads the DMG plus SHA-256 checksum, and creates the GitHub Release.
6. Download the DMG from the new GitHub Release on a clean Apple Silicon Mac. Drag Ryte to Applications, launch it, then select a synthetic notes folder and confirm keyword search works without API keys.

Never retag a published release. Create the next pre-1.0 version instead.
