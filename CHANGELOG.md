# Changelog

All notable changes to `welight-cli` will be documented in this file.

The format is based on Keep a Changelog, with one section per released version.

## [Unreleased]

### Added

- Added `wl config path/list/get/set/unset/export/import` commands for inspecting and managing CLI configuration without rerunning setup.
- Added a dedicated command reference at `docs/指令帮助文档.md`.

### Changed

- Updated the README and installation guide with clearer install, update, uninstall, and release-note documentation.

## [0.0.2] - 2026-04-19

### Changed

- Switched most CLI runtime prompts, setup text, and help output to English for a more consistent terminal experience.
- Restored built-in theme labels to the original Welight naming so theme choices stay familiar.

### Fixed

- Cleaned up article workflow messaging and aligned the related HTML conversion test expectations.

### Removed

- Removed theme `w021 朱槿 - 左侧胶囊二级标题` from the CLI theme catalog.

## [0.0.1] - 2026-04-18

### Added

- Initial public release of `welight-cli`.
- Added setup onboarding, license validation, article composition, AI writing, theme rendering, cover generation, clipboard copy, and WeChat publishing flows.
- Added automated npm publishing and GitHub Release creation on pushes to `main`.
