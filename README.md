# Codex Auth Switcher

A CLI tool for switching between multiple Codex accounts with real-time usage tracking.

## Features

- Interactive account selection with visual indicators
- Real-time API usage display (weekly quota)
- Automatic account state backup before switching
- Support for multiple account management

## Installation

```bash
bun install
```

## Usage

Run directly:

```bash
bun run main.ts
```

Or use the global command (after linking):

```bash
codex-switch
```

## How it Works

1. The tool reads account files from `~/.codex/accounts/` directory
2. Each account file is named in the format: `email_auth.json` (e.g., `user_gmail_com.auth.json`)
3. The active account is tracked in `~/.codex/accounts/registry.json`
4. When switching accounts:
   - Current account state is backed up to its file
   - Target account data is loaded and written to `~/.codex/auth.json`
   - Registry is updated with the new active account ID

## Display Format

```
  ACCOUNT              PLAN    WEEKLY USAGE
  ------------------------------------------------------
  user@example.com     free    85% (14:30 on 25 Mar)
* admin@test.com       free    92% (18:45 on 26 Mar)
```

- `*` indicates the currently active account
- `WEEKLY USAGE` shows remaining quota percentage and reset time

## Requirements

- [Bun](https://bun.sh/) runtime
- Existing Codex authentication files in `~/.codex/`

## License

MIT
