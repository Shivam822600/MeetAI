# Release validation

## Automated gates

- `npm ci` on Node 22.13+; Electron binary installation.
- `npm run check`: strict types, lint, unit and integration tests.
- `npm run build`: main/preload/renderer/worklet production artifacts.
- `npm run smoke`: settings, project creation, local document preview, explicit consent, mock transcription/answers, overlay pause/resume/stop, history, restart persistence.
- `npm run format:check`.
- `npm run build:win`: unsigned x64 NSIS installer, no credentials or test fixtures in its archive.

## Windows and provider gates

These require a Windows machine, physical devices, provider credentials, and (for companion pairing) a second trusted device. Automated mock tests do not establish them.

- Install and uninstall the NSIS build as a regular user; verify application data policy.
- Configure keys, close/reopen, confirm encrypted storage and key removal behavior.
- Capture microphone and default playback audio separately at each sample rate.
- Confirm audio stops on pause, stop, sleep, renderer crash, and exit.
- Speak while stopping: verify the final sentence is saved or a finalization timeout is reported.
- Unplug/reconnect microphone; switch playback device while paused; resume.
- Check network loss, reconnect, invalid keys, rate limits, and slow answers.
- Test actual OpenAI streaming and embeddings; review sources and unsupported-model errors.
- Import representative PDFs, reject scanned/oversized/credential-bearing files; edit, search, delete, restart.
- Check multiple monitors, negative coordinates, compact mode, overlay focus and click-through recovery.
- Verify sharing/content-protection behavior with each meeting platform; do not assume exclusion.
- Start companion with a trusted certificate; pair a second device; verify wrong-origin/expired/reused links fail, and stop/exit disconnects and clears displayed content.
- Test dark/light themes, keyboard navigation, smaller windows, and display scaling.

## Public distribution

- Sign the executable and installer with the publisher's certificate; do not commit signing secrets.
- Publish accurate provider/privacy disclosures and a support channel.
- Run a fresh dependency audit and review findings before each distribution.
- Rotate any real credential formerly present in `.env.example`.
