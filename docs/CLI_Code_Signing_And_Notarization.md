# CLI Code Signing and Notarization

This document is intended for DevOps and release engineering. It describes how to evolve the current standalone `icuewidget` release pipeline into a signed and trusted distribution flow for macOS and Windows.

## Goals

- sign Windows binaries so users see a trusted publisher instead of an unknown executable warning
- sign macOS binaries with Developer ID
- notarize macOS release archives so Gatekeeper accepts the CLI more smoothly
- keep signing materials out of the repository and inject them only in CI/CD

## Current state

Today, the workflow:

- builds standalone binaries with PyInstaller
- produces release archives for macOS and Windows
- publishes them to GitHub Releases

Placeholder steps already exist in `.github/workflows/release-cli.yml` for future signing and notarization.

---

## Windows signing

### Recommended approach

Use **Authenticode signing** with a code-signing certificate.

Typical tooling:

- `signtool.exe`
- a `.pfx` certificate file and password
- a timestamp server, for example DigiCert or Sectigo

### What DevOps will need

- a code-signing certificate issued to the organization
- certificate stored securely, ideally in:
  - GitHub Actions encrypted secrets + temporary file materialization, or
  - a cloud/HSM-backed signing service, or
  - a secure internal signing runner
- certificate password
- timestamp URL

### Typical signing command

```powershell
signtool sign \
  /fd SHA256 \
  /tr http://timestamp.digicert.com \
  /td SHA256 \
  /f signing-cert.pfx \
  /p $env:WINDOWS_CERT_PASSWORD \
  release\icuewidget-<version>-windows\icuewidget.exe
```

### Suggested GitHub secrets

- `WINDOWS_SIGNING_CERT_BASE64`
- `WINDOWS_SIGNING_CERT_PASSWORD`
- `WINDOWS_TIMESTAMP_URL`

### Suggested workflow shape

1. decode base64 certificate into a temporary `.pfx`
2. sign `icuewidget.exe`
3. verify signature
4. package/upload the signed artifact

### Example verification

```powershell
Get-AuthenticodeSignature release\icuewidget-<version>-windows\icuewidget.exe
```

---

## macOS signing

### Recommended approach

Use **Developer ID Application** signing for the standalone CLI binary.

Typical tooling:

- `codesign`
- Apple Developer account
- Developer ID Application certificate exported as `.p12`

### What DevOps will need

- Apple Developer account with Developer ID capability
- Developer ID Application certificate
- certificate password
- Apple Team ID

### Suggested GitHub secrets

- `APPLE_DEVELOPER_ID_CERT_BASE64`
- `APPLE_DEVELOPER_ID_CERT_PASSWORD`
- `APPLE_TEAM_ID`
- optionally `APPLE_SIGNING_IDENTITY`

### Typical CI flow

1. decode the `.p12` certificate from base64
2. create a temporary keychain on the GitHub macOS runner
3. import the certificate into that keychain
4. unlock the keychain and make it available to `codesign`
5. sign the `icuewidget` binary
6. verify the signature

### Example commands

```bash
security create-keychain -p "$RUNNER_TEMP" build.keychain
security default-keychain -s build.keychain
security unlock-keychain -p "$RUNNER_TEMP" build.keychain
security import developer-id.p12 -k build.keychain -P "$APPLE_DEVELOPER_ID_CERT_PASSWORD" -T /usr/bin/codesign

codesign \
  --force \
  --options runtime \
  --sign "Developer ID Application: COMPANY NAME (TEAMID)" \
  release/icuewidget-<version>-macos/icuewidget
```

### Example verification

```bash
codesign --verify --deep --strict --verbose=2 release/icuewidget-<version>-macos/icuewidget
spctl -a -vv release/icuewidget-<version>-macos/icuewidget
```

---

## macOS notarization

### Why notarize

Developer ID signing helps identify the publisher. **Notarization** helps macOS Gatekeeper trust the downloaded artifact.

For CLI distribution, a practical approach is:

1. sign the standalone binary
2. package it as a `.zip`
3. submit the `.zip` to Apple notarization
4. distribute the notarized archive

### What DevOps will need

- Apple ID with access to notarization
- app-specific password or App Store Connect API key
- Team ID
- `xcrun notarytool`

### Suggested GitHub secrets

- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

Alternative API-key-based flow:

- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER_ID`
- `APPLE_API_PRIVATE_KEY_BASE64`

### Example notarization command

```bash
xcrun notarytool submit \
  release/icuewidget-<version>-macos.zip \
  --apple-id "$APPLE_ID" \
  --team-id "$APPLE_TEAM_ID" \
  --password "$APPLE_APP_SPECIFIC_PASSWORD" \
  --wait
```

### Notes

- For a simple CLI zip, stapling is often not applicable the same way it is for `.app`, `.pkg`, or `.dmg` bundles.
- In practice, signing the binary and notarizing the zip archive is the relevant workflow here.
- DevOps should validate the exact end-user Gatekeeper behavior for your chosen distribution format.

---

## Recommended CI secret handling

- never commit certificates or private keys to the repository
- store certificates as base64-encoded GitHub secrets or use an external signing service
- materialize certificates only during the workflow run
- delete temporary certificate files and keychains after signing
- restrict release workflow permissions to the minimum required

---

## Recommended future workflow order

### Windows

1. build executable
2. sign executable
3. verify signature
4. zip signed output
5. upload/publish

### macOS

1. build executable
2. sign executable with Developer ID
3. verify signature
4. zip signed output
5. notarize zip
6. publish notarized archive

---

## Suggested handoff checklist for DevOps

- [ ] Decide whether Windows signing will use local certificate files, HSM, or cloud signing
- [ ] Provision Windows code-signing certificate
- [ ] Provision Apple Developer ID Application certificate
- [ ] Decide whether notarization will use Apple ID/app-specific password or App Store Connect API key
- [ ] Create GitHub repository/environment secrets
- [ ] Replace placeholder signing steps in `.github/workflows/release-cli.yml`
- [ ] Add signature verification steps to fail the build if signing breaks
- [ ] Test end-user install flow on a clean Windows machine
- [ ] Test end-user install flow on a clean macOS machine

---

## Suggested repo follow-ups

Potential next improvements after signing is enabled:

- Homebrew formula for macOS
- winget manifest for Windows
- release checksum generation
- SBOM generation
- provenance/attestation for release artifacts
