# MeetPilot AI

A Windows desktop assistant for consented technical meetings: separate system and microphone transcription, suggested answers, reviewed project knowledge, a floating assistant, local history, and an optional private-network companion display.

## Run locally

Use **Node.js 22.13 or later** (Node 22 LTS is pinned by `.nvmrc`) and npm. Windows is required for real system audio capture. Linux and macOS can run the UI and mock sessions.

```sh
npm ci
npm run dev
```

`npm ci` installs the Electron binary through the project's postinstall script. Internet access is needed for npm and Electron downloads. If installation was run with `--ignore-scripts`, run `node node_modules/electron/install.js` afterward. On Linux, keep the normal sandbox enabled for daily use; the automated headless smoke script alone passes `--no-sandbox`.

For a credential-free demonstration, open **Settings**, enable **Explicit mock mode**, and save. Start a meeting from the main window, enter a topic, and confirm consent. Simulated questions arrive every five seconds. No microphone capture, transcription requests, answer requests, or embeddings requests run in mock mode. Document preview and project management remain available; indexing/search require real mode and an OpenAI key.

To use the ZIP distribution on Windows, extract the entire archive into a folder and run `MeetPilot AI.exe` from that folder. Keep its supporting files alongside it. This build is unsigned.

## A real meeting

1. On Windows, add your OpenAI and Deepgram API keys in Settings. Select a model your OpenAI account can access; the default is `gpt-4.1-mini`. A configured key has not been verified until used.
2. Select your microphone and set the Windows default playback device. Use headphones to reduce acoustic duplication.
3. Optionally create a project under Project knowledge. Review and index only the documents you want available to that project.
4. Start a meeting from the main window, select its project, and obtain participant consent before confirming.
5. Pause stops capture and waits up to four seconds for final transcription. Resume reconnects both sources. Stop saves final transcripts and a local extractive recap.
6. Use Meeting history to search topics/recaps, inspect transcripts and answers, refresh the recap, export Markdown/JSON, or delete sessions.

System capture includes the complete default playback mix, including other applications. It is not per-application capture. Source labels distinguish the microphone from system audio; they do not identify individual remote speakers. Automatic question detection currently uses English technical-question rules. Other speech/answer languages can be configured, with manual questions available when detection does not apply.

## Project knowledge

Create/edit/delete projects, then choose **Review a document**. Supported files are UTF-8 text, Markdown, and text-based PDFs: maximum 5 MB, 200 PDF pages, and 120,000 extracted characters. Scanned PDFs require OCR elsewhere.

Extraction and preview are local. Edit the preview to remove sensitive content, check the approval box, and choose **Approve & index**. Approved text is sent to OpenAI's `text-embedding-3-small` model at 512 dimensions. Text and vectors are kept in local SQLite. A project is limited to 2,000 chunks. Credential screening is heuristic and does not replace your review.

Editing an imported document requires renewed approval and replaces its index only after all new embeddings succeed. Search sends the query for embedding and ranks only that project's local chunks. Meeting answers use up to four matching excerpts with source labels. Removing a document removes its local index; it does not rewrite past answers or change provider retention.

## Floating assistant

Use **Float** during a meeting or the toggle shortcut. Drag its title bar, adjust compact mode/opacity/theme in Settings, and use click-through only when the recovery shortcut is available. Start meetings from the main window. The overlay can pause, resume, mute, stop, and generate answers.

Default shortcuts use Ctrl on Windows:

| Action                 | Shortcut             |
| ---------------------- | -------------------- |
| Toggle overlay         | Ctrl+Shift+Space     |
| Generate answer        | Ctrl+Shift+Enter     |
| Pause/resume           | Ctrl+Shift+P         |
| Stop                   | Ctrl+Shift+X         |
| Previous/next answer   | Ctrl+Shift+Up / Down |
| Recover overlay clicks | Ctrl+Shift+Escape    |

Shortcut conflicts are reported in the app. Content protection is optional and cannot guarantee exclusion from every sharing/capture tool.

## Companion display

The companion is off by default. In Settings, select a private IPv4 address actually assigned to this computer, then choose **Choose TLS files & start**. Select a TLS certificate whose IP subject alternative name matches that address, followed by its private key. The certificate must be valid and trusted by the companion device; the app does not bypass TLS warnings or distribute trust certificates.

Scan the QR code or open its link on a trusted device on the same network. The token is single-use, lives in the URL fragment, and is exchanged for a Secure, HttpOnly, SameSite cookie. The browser removes the fragment immediately. The display receives only the latest question/answer, topic, status, and source labels. It has no control API. Sharing expires after 15 minutes, or immediately when stopped or the app exits. Start again to issue a new link. The server binds an ephemeral port only on the selected private address; firewall configuration may be needed. IPv6, public hosting, and automatic certificate creation are not supported.

## Data and credentials

The normal Electron user-data directory contains `meetpilot.db`, `credentials.json`, and `overlay.json`. On Windows this is typically `%APPDATA%\meetpilot-ai`. SQLite text is not encrypted. Use your account permissions and disk encryption to protect it. Raw audio is not written to disk. Writes are atomically replaced, queued, and flushed at shutdown; an abrupt process/OS failure can lose the most recent unsaved changes.

Provider keys entered in Settings use Electron safeStorage (Windows DPAPI). Environment variables `OPENAI_API_KEY` and `DEEPGRAM_API_KEY` can also provide keys; removing a saved key does not remove a key inherited from the environment. `.env.example` contains empty placeholders only. The app does not automatically load `.env` files. Never commit keys. Rotate any real key that was previously included in this project's example file.

Retention defaults to 30 days and runs on startup/settings save. Set zero to retain history until manual deletion. Deleting local data cannot delete copies previously exported or sent to providers. Responses are suggestions; verify facts, code, sources, and commitments before using them.

## Validate and package

```sh
npm run check          # TypeScript, ESLint, unit/integration tests
npm run build          # Production main, preload, renderer, AudioWorklet
npm run smoke          # Build and Electron UI workflow with a temporary profile
npm run format:check
npm run build:win      # Windows x64 NSIS installer in dist/ (build on Windows)
npm run build:win:zip  # Windows ZIP distribution in dist/
```

On a headless Linux machine use `xvfb-run -a npm run smoke`. Tests require permission to bind a loopback socket for companion TLS/WebSocket integration. The TLS key in `tests/fixtures` is a public, disposable localhost-only test fixture and must never be used for real sharing. Smoke tests clear provider keys, use mock mode, and remove their temporary profile. Screenshots go to `artifacts/`.

The Windows installer is currently **unsigned**. Signing credentials are not included. `signExecutable: false` keeps the app unsigned while applying its icon and metadata. Cross-platform NSIS packaging uses electron-builder’s pinned Wine toolset; the bundle failed on this Linux host because required DLLs were missing. Build the installer on Windows using the included CI workflow. ZIP packaging does not need Wine. Supply a publisher signing configuration for a public release. Installation, actual WASAPI capture, microphone unplug/recovery, monitor changes, capture protection, real provider latency, and trusted-device pairing still require Windows/manual verification. See [release validation](docs/RELEASE_CHECKLIST.md).

## Structure

- `src/main`: IPC/security, audio lifecycle, providers, intelligence, knowledge, companion, SQLite, windows, shortcuts.
- `src/preload`: narrow typed bridge, no renderer access to keys or arbitrary files.
- `src/renderer`: React pages, audio capture/worklet, state and UI.
- `src/shared`: schemas and cross-process types.
- `tests`: unit tests and persistence/network integration coverage.
- `scripts/smoke.cjs`: desktop workflow and restart verification.

Integration references: [OpenAI embeddings](https://developers.openai.com/api/reference/typescript/resources/embeddings/methods/create), [Deepgram CloseStream](https://developers.deepgram.com/docs/close-stream), [PDF.js](https://mozilla.github.io/pdf.js/examples/).
# MeetAI
