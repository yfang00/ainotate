# Changelog

## [0.4.0] - 2026-02-11

### Added
- Custom WebviewPanel with embedded iframe (replaces Simple Browser)
- Cookie persistence across sessions via reverse proxy and virtual cookie jar
- Auto-close panel when plan is approved or feedback is sent
- VS Code notification when panel opens
- Tab icon for Ainotate panel
- Ainotate output channel for diagnostics

### Changed
- Renamed display name from "Ainotate WebView" to "Ainotate"

## [0.1.0] - 2026-02-11

### Added
- Initial release
- Intercept Ainotate browser opens in VS Code integrated terminal
- URI handler for `vscode://ainotate-webview/open?url=...`
- Router shell script for AINOTATE_BROWSER env var
- Configurable URL pattern matching
- Manual URL opening command
