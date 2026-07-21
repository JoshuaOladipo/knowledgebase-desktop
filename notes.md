The manual `Package Check` GitHub Actions workflow runs all three native packaging jobs and uploads their artifacts. macOS signing and notarization are intentionally disabled for development builds; production releases should supply signing credentials and enable notarization.

## Release Checklist

- Run all quality checks and the GitHub Actions package matrix.
- Install each artifact on a clean Linux, Windows, and macOS system.
- Select one and multiple folders, restart the app, and confirm restoration.
- Add, edit, rename, and delete files and folders while both views are open.
- Confirm search, selection, details, tray behavior, and permission errors.
- Confirm external links allow only HTTP and HTTPS destinations.
- Configure GitHub release publishing and platform signing credentials before distribution.

## Supported Platforms

The source normalizes file paths using Node's platform-aware path utilities and Electron supplies native folder dialogs on Linux, Windows, and macOS. Native behavior is verified through the packaging matrix and the release checklist above.