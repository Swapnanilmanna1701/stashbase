# StashBase

**Turn local files into searchable context for Agents.**

[![Website](https://img.shields.io/badge/website-stashbase.ai-0a66c2.svg)](https://stashbase.ai)
[![Release](https://img.shields.io/github/v/release/liliu-z/stashbase?label=release)](https://github.com/liliu-z/stashbase/releases/latest)
[![Status](https://img.shields.io/badge/status-early%20alpha-orange.svg)](#status)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Discord](https://img.shields.io/badge/Discord-support%20%26%20chat-5865F2.svg?logo=discord&logoColor=white)](https://discord.gg/zsRZH4PTq9)

Much of your best context lives in local files that Agents can't easily search — papers, contracts, scanned documents, recordings. 📂 Open a folder in StashBase and its supported contents become searchable:

- 📄 **Prepare:** extract searchable text from PDFs, DOCX files, images, audio, and video.
- 🔎 **Search:** find relevant context by meaning, not just keywords.
- 🤖 **Connect:** share searchable context across Claude, Codex, and other MCP clients.

Your folders remain the source of truth; StashBase adds a search index that can be rebuilt from them.

The core idea:

```text
Local files -> prepared text -> search index -> MCP -> Agents
```

---

## 🚀 Demo

Open this repo in StashBase and ask the built-in Agent: **How is this project designed?**

![StashBase demo: opening local design docs and asking the Agent about architecture and product direction](assets/readme/demo.gif)

---

## 💡 Try It

StashBase's primary platforms are **macOS 12+ (Apple Silicon)** and **Windows 10+ (x64)**. A community-supported Linux build is also available for **x86_64 Debian 12+ / Ubuntu 22.04+**.

### macOS

Apple Silicon Macs running macOS 12 or later can install with Homebrew:

```bash
brew install --cask liliu-z/stashbase/stashbase
```

Or download the `StashBase-*-mac-arm64.dmg` from [Releases](https://github.com/liliu-z/stashbase/releases), drag the app to **Applications**, and open it there. If macOS says the app is damaged or asks to move it to Trash, use the `Fix.sh` included in that DMG to repair the copy in Applications.

### Windows

1. Download the latest `StashBase-*-win-x64.exe` installer from [Releases](https://github.com/liliu-z/stashbase/releases)
2. Run the installer
3. **If Windows SmartScreen appears:**
   - Windows SmartScreen is a security feature that warns about files from the internet. Since you've confirmed the installer came from the official GitHub Releases page, it's safe to proceed
   - Click **More info** → **Run anyway**
4. Follow the installer prompts to complete installation

**To update**: Quit StashBase, then run the newer installer over the existing installation.

**To uninstall**: Open **Settings → Apps**, then select **StashBase** under **Installed apps** (Windows 11) or **Apps & features** (Windows 10).

### Linux

For Debian 12+ or Ubuntu 22.04+ on x86_64, download the latest `StashBase-*-linux-amd64.deb` asset from [Releases](https://github.com/liliu-z/stashbase/releases), then install it with `apt` so any required system packages are resolved:

```bash
sudo apt install ./StashBase-*-linux-amd64.deb
```

Run the same command with a newer package to update. To remove StashBase, run `sudo apt remove stashbase`.

For a portable build, download `StashBase-*-linux-*.AppImage`, make it executable with `chmod +x`, and run it directly.

### First Launch

When you open StashBase for the first time:

1. **Open a folder**: Click the folder icon to choose a local folder containing files you want to search
2. **(Optional) Set up AI Index**: To search by meaning and give Agents better retrieval, add an OpenAI or OpenRouter API key in **Settings → AI Index**. An OpenAI restricted key needs access only to embeddings with `text-embedding-3-small`; model-list access is not required.
3. **(Optional) Set up transcription**: To transcribe audio or video, download a speech model from **Settings → Transcription**. Small (465 MiB) is the default; Tiny (74 MiB) and Base (141 MiB) are lighter options. Transcription runs entirely on your machine, with no API cost, and you can cancel or rerun it while viewing the file
4. **(Optional) Connect to Claude/Codex**: From **Settings → MCP**, connect external AI tools to access your searchable library
5. **Start in Chat**: Opening a folder starts a fresh built-in Agent chat.
   Codex is the first default; after you choose Claude or Codex, StashBase
   remembers that choice. Selecting a source file brings the document
   alongside the same conversation.

Your library is **opt-in**: only folders you open in StashBase are indexed. You can remove a folder at any time; StashBase clears its index but never deletes your files from disk.

> Haven't set up AI Index? In-app exact text search still works. Join our [Discord](https://discord.gg/zsRZH4PTq9) to ask about evaluation access.

### Updating and Uninstalling

- **Updates**: Quit StashBase and run the newer installer. Your library and settings are preserved
- **Uninstalls**: On macOS, remove StashBase from Applications; on Windows or Linux, follow the platform-specific removal steps above. Your local files are never deleted

### Troubleshooting Installation

**Installer won't start on Windows**
- Make sure the file extension is `.exe` (not `.msi` or other formats)
- Try running the installer as Administrator (right-click → Run as administrator)
- If antivirus software blocks it, temporarily disable it and try again (it's safe to do so from official releases)

**"App is damaged" error on macOS**
- This can happen with unsigned builds. The `Fix.sh` script in the DMG resolves this
- Drag StashBase to Applications, then run the `Fix.sh` from the DMG

**App won't launch after installation**
- Try restarting your computer
- Uninstall and reinstall the latest version
- Check the [Discord community](https://discord.gg/zsRZH4PTq9) for help

**Out of disk space errors**
- Your library index needs space proportional to your files. Add more disk space or remove large files
- Remove the folder from the Library to clear its StashBase-owned index and derived data. Your source files are never deleted

**Can't find installed app**
- On Windows: Press the Windows key and search for "StashBase"
- On macOS: Open Finder → Applications → look for StashBase
- On Linux: Run `stashbase` from terminal or find it in your applications menu

---

## Usage Tips

Use **File → New Window** or Cmd/Ctrl+Shift+N to keep different folders and
tools side by side. Window close follows VS Code's platform shortcuts;
Cmd/Ctrl+W continues to close the active document tab.

Use Cmd/Ctrl+O to open a source file in the active folder. The Command Palette
opens with Cmd/Ctrl+Shift+P or F1 (or by typing `>` in Quick Open) and exposes
safe application actions with their existing safeguards.

Use **Help → Report Bug…** to review a current-window screenshot, redacted
recent logs, and diagnostics before opening a prefilled GitHub report. Nothing
is uploaded automatically, and copy/save fallbacks work without GitHub.

---

## What It Does

StashBase has two core jobs: prepare files and index their contents.

### Prepare

Some formats need preparation before their contents can be searched. StashBase keeps the original files in place and creates derived text only where needed for search and Agent access.

| Format | Visible source | Indexed text |
|---|---|---|
| Markdown | The Markdown file | Source text |
| HTML | The HTML file | Clean text extracted from the HTML |
| JSON | The JSON file | Raw source text |
| PDF | The original PDF | Derived Markdown |
| DOCX | The original DOCX | Derived HTML |
| Images | The original image | OCR text |
| Audio and video | The original media | Audio track transcribed locally to timestamped Markdown |

For PDF, DOCX, audio, and video, Agents read the derived text while the original remains the visible source file. Audio and video play directly when supported; otherwise, StashBase creates a compatible local audio preview. Large files dragged into the app stream to disk instead of being held entirely in memory. See [Architecture](design-docs/architecture.md) and [Preparation](design-docs/design/preparation.md) for the product and system contracts.

### AI Index

StashBase builds its AI Index and exact text search over:

- Markdown, HTML, and raw JSON text
- PDF-derived Markdown
- DOCX-derived HTML
- OCR text from images
- timestamped transcripts from audio and video

Search results point back to the user-visible source file, not hidden app data.

Background preparation is intentionally quiet. Browsing a folder should feel like browsing files, not watching an indexing job. If preparation fails, StashBase shows a lightweight failure marker and lets you retry. Readiness matters most when you search, so that is where StashBase shows how much of your content is ready.

---

## MCP

MCP is the main interface between StashBase and Agents.

While the StashBase app is running, a local MCP server makes the same library available to external clients and the built-in Agent panel.

Core tools:

- `library_info` - return the default folder home, opened folders, optional folder descriptions, and embedder status.
- `search_library` - search the library, optionally scoped by folder, path prefix, or file-type categories.
- `reindex` - reconcile disk changes and make updated files searchable.

StashBase also exposes bounded file helpers for opened folders:

- `list_directory`
- `read_file`
- `write_file`
- `edit_file`
- `move_file`
- `delete_file`

These helpers exist for Agent clients that run in a sandbox and cannot directly access the user's host files. They are not a general-purpose filesystem API.

### Connect a Client

The normal path is **Settings -> MCP**. StashBase can write the MCP config for supported clients or copy the stdio snippet for clients that manage config themselves.

For manual stdio setup, URL-based clients, Docker access, ports, CORS boundaries, and token rotation, see [Advanced MCP configuration](docs/mcp-configuration.md).

---

## Built-In Agent Chat

StashBase includes a built-in chat for running local Agent CLIs such as Claude
Code and Codex against the current folder. Chat fills the workspace until you
open a document, then adapts into a side panel so the conversation and source
stay visible together.

The chat is a convenient client of the same MCP server, not a separate
knowledge base. It adds:

- Sessions run in the current folder, next to the files they work on.
- A fresh conversation opens with each folder; Codex is the first default and
  later folder chats use the Agent you last selected.
- Tool calls and file edits can be reviewed in the app.
- Session history stays in the Agent CLI's normal storage.
- `@` mentions find files and folders with forgiving workspace-path search;
  selecting one inserts only its workspace-relative path.

---

## Storage Model

Local files are the source of truth.

```text
~/.stashbase/config.json          # app-level config, including transcription preferences

<folder>/
  paper.pdf                       # user file

<appData>/derived.nosync/         # derived text, assets, transcript work, media previews
<appData>/models/whisper/         # explicitly downloaded local speech models
<appData>/vector-store.nosync/    # Milvus Lite vector store
<appData>/state/state.db          # conversion failures and local app state
```

Removing a folder from the library clears StashBase's app-owned state for that folder. It does not delete the folder or its files from disk.

---

## Design Docs

The design docs explain the product intent, system contracts, and contribution
areas without duplicating the source tree:

- [Design docs guide](design-docs/README.md) - contribution map and maintenance rules
- [Overview](design-docs/overview.md) - product thesis
- [Principles](design-docs/principles.md) - durable decision rules
- [Architecture](design-docs/architecture.md) - system boundaries and invariants
- [Product direction](design-docs/product-direction.md) - intended product shape

---

## Build From Source

For contributors and developers building locally, and for platforms without a prebuilt installer.

### Linux prerequisites (Ubuntu / Debian)

Install Node.js 22.12+, pnpm, Python 3.10+, and the native build tools used by the packaged sidecars:

```bash
sudo apt install build-essential binutils cmake curl git nasm pkg-config python3 python3-venv xz-utils
```

```bash
git clone https://github.com/liliu-z/stashbase
cd stashbase
pnpm install
pnpm setup:python

# Build the renderer and run Electron
pnpm build:web
pnpm electron

# Development mode
pnpm dev

# Build a distributable app for your platform
pnpm dist        # macOS
pnpm dist:win    # Windows
pnpm dist:linux  # Linux (.deb and .AppImage)

# Optional: include the local PDF/OCR extractor sidecar
pnpm build:python-extract-sidecar
```

Before opening a PR:

```bash
pnpm check
```

---

## Status

Early alpha.

Primary support:

- macOS arm64
- Windows 10+ x64

Community-supported:

- Linux x86_64 Debian 12+ / Ubuntu 22.04+

Reasonably stable:

- Local folder library model
- Markdown, HTML, JSON, PDF, and image preview
- PDF extraction, image OCR, and local audio and video transcription, with persisted failures and retry
- AI Index and exact text search
- MCP server and client connectors
- Bounded file helpers for sandboxed Agents
- Built-in Claude Code / Codex panel

### Where We Need Help

- [Agent panel polish](https://github.com/liliu-z/stashbase/issues?q=is%3Aissue+is%3Aopen+label%3A%22area%3A+agent-panel%22)
- [Search filters and ranking controls](https://github.com/liliu-z/stashbase/issues?q=is%3Aissue+is%3Aopen+label%3A%22area%3A+search%22)
- [Long-running conversion and recovery edge cases](https://github.com/liliu-z/stashbase/issues?q=is%3Aissue+is%3Aopen+label%3A%22area%3A+preparation%22)
- [Packaging polish across platforms](https://github.com/liliu-z/stashbase/issues?q=is%3Aissue+is%3Aopen+label%3A%22area%3A+packaging%22)

---

## Contributing

Small focused PRs are preferred. Open an issue before larger changes so scope and direction can be discussed first.

Not sure where to start? Pick something from [Where We Need Help](#where-we-need-help), or open [`design-docs/`](design-docs/) in StashBase and ask the Agent — or just ask us.

See [CONTRIBUTING.md](CONTRIBUTING.md) for local development, validation, and release-maintainer notes.

---

## About

StashBase is an independent open-source project built by [Li Liu](https://github.com/liliu-z), who works on [Milvus](https://github.com/milvus-io/milvus) at [Zilliz](https://zilliz.com) and brings years of vector-retrieval experience to making local files searchable in Agent workflows.
