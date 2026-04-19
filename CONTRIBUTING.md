# Contributing

Thanks for your interest in contributing to `welight-cli`.

## Before you start

- Read the [README](./README.md) for the product overview and local development commands.
- Check existing issues and pull requests before starting new work.
- For larger feature ideas or behavior changes, open an issue first so the direction can be aligned before implementation starts.

## Development setup

```bash
pnpm install
pnpm build
pnpm test
```

To run the CLI locally:

```bash
./bin/run.js --help
./bin/run.js
```

## Branch and commit guidance

- Keep pull requests focused on one problem.
- Prefer small, reviewable commits.
- Use clear commit messages that explain the user-facing change.

## Code quality expectations

Before opening a pull request, make sure:

- `pnpm build` passes
- `pnpm test` passes
- New behavior includes tests when practical
- Documentation is updated when commands, flags, workflows, or release behavior change

## Pull requests

Please include:

- What changed
- Why the change is needed
- How you tested it
- Screenshots or terminal output when the change affects CLI UX

## Release notes

If your change should appear in the next release notes, update the `Unreleased` section in [CHANGELOG.md](./CHANGELOG.md).

## Questions

For usage questions or product discussion, open a GitHub issue.
For security issues, follow [SECURITY.md](./SECURITY.md).
