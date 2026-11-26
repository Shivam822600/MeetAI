# MeetPilot AI implementation plan

Build a Windows-first Electron application in nine sequential, validated phases. The starting workspace is empty. No existing user files will be replaced.

1. **Desktop foundation:** Electron Vite, strict TypeScript, React, Tailwind, shadcn-style accessible UI primitives, Zustand, five navigation pages, typed restricted preload, secure windows. Gate: typecheck, lint, foundation tests and production build.
2. **Audio:** explicitly consented, independent WASAPI-backed Electron system loopback and microphone capture; AudioWorklet PCM resampling, meters, mute, silence, bounded transport, lifecycle and recovery. Gate: lifecycle/resampler tests and static checks; physical devices remain a manual gate.
3. **Transcription:** provider interface, Deepgram WebSocket streaming, partial/final events, source labeling, deduplication, bounded buffering and reconnect. Gate: mock socket/reconnect/dedup tests and static checks.
4. **Intelligence:** contextual question rules, confidence/duplicate controls, bounded context with extractive summarization, OpenAI Responses streaming and cancellation, explicit mock mode. Gate: detector, budget, stream parser and cancellation tests.
5. **Overlay:** persistent monitor-aware floating window, opacity, theme, compact mode, focus-safe updates, content protection and recoverable click-through; configurable global shortcuts. Gate: policy tests and static/build checks; manual monitor and sharing tests.
6. **Persistence:** SQLite sessions, transcripts, answers, projects and settings; encrypted credentials, retention, search, export, explicit summary generation. Gate: database/settings/IPC integration tests.
7. **Knowledge:** explicit file picker, local text/PDF extraction, sensitive-file screening, review before sending, chunk embeddings in SQLite, semantic retrieval and references, editing/deletion. Gate: chunk/retrieval/security tests.
8. **Companion:** opt-in HTTPS/WSS LAN display with user-supplied trusted TLS certificate, QR pairing, expiring authentication, disconnect. No public listener by default. Gate: authentication, expiry and security tests.
9. **Release:** security review, end-to-end mock desktop smoke test, complete documentation, application icon, Electron Builder x64 NSIS packaging. Gate: all checks and actual installer build; clearly report any unexecuted hardware/provider/signing checks.

Each phase is recorded in PROGRESS.md after implementation and its automated gate. Real credentials are neither required for automated tests nor invented. Actual audio, network-provider latency, meeting-platform compatibility and screen-capture behavior require separately recorded Windows tests.
