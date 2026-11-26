# Architecture decisions

- Electron main owns credentials, database, external network requests, window lifecycle and IPC policy. Sandboxed renderers receive a small typed API, never Node, arbitrary paths, shell access or API keys.
- Windows system capture uses Electron/Chromium's WASAPI loopback through setDisplayMediaRequestHandler. It captures the default playback mix, not an individual meeting app. Output device selection is performed in Windows. No additional native helper is required for this supported path.
- The main application renderer owns audio tracks and worklets; the overlay cannot request capture. Session cancellation and application exit tear down all tracks and sockets. Raw audio is never saved.
- Deepgram receives separate mono linear16 streams for microphone and system audio. Source labels do not imply individual remote-speaker diarization. Headphones are recommended to reduce acoustic duplicates.
- AI requests use bounded local context and explicitly reviewed project documents. Transcripts and documents are untrusted data. Responses are suggestions, not verified project commitments.
- SQLite remains local. Credentials use Electron safeStorage (Windows DPAPI); meeting text is not represented as encrypted-at-rest. Windows account permissions and disk encryption provide storage protection.
- Optional companion display is the only listening server. It is off by default, HTTPS only, bound to a chosen private LAN address, with short-lived tokens. User must supply a trusted certificate for that address/hostname.
- Windows content protection is optional and does not guarantee exclusion from every capture/sharing method. Use an unshared window, second monitor or companion device when needed.

## Official references

- https://www.electronjs.org/docs/latest/api/session
- https://www.electronjs.org/docs/latest/api/browser-window
- https://www.electronjs.org/docs/latest/tutorial/security
- https://electron-vite.org/guide/
- https://developers.deepgram.com/reference/speech-to-text/listen-streaming
- https://developers.deepgram.com/docs/audio-keep-alive
- https://developers.openai.com/api/docs/guides/streaming-responses
- https://developers.openai.com/api/docs/guides/embeddings

## Completed knowledge and companion services

Knowledge previews use a native file picker and local PDF.js/text extraction. Only edited text approved in the UI is passed to the embeddings provider. Imports and reindexing are atomic database transactions; failed embeddings preserve the earlier document. Retrieval ranks local vectors within the selected project and returns at most four labeled excerpts. Original filenames/paths are never accepted as arbitrary renderer file reads.

The companion listens only after explicit setup on an enumerated private IPv4 interface. The user chooses a currently valid certificate matching that IP and its private key. A single-use random token in the URL fragment establishes a Secure, HttpOnly, SameSite cookie. Origin-checked WebSockets push only display content; the server exposes no meeting-control endpoints. Expiry or stop terminates existing sockets. The shell, script and stylesheet are local assets with a restrictive Content Security Policy.

Meeting pause/stop blocks new audio frames, tells the capture renderer to stop, and retains the old transcription generation while CloseStream drains. A four-second timeout bounds shutdown. New sessions cannot start during draining, and delayed renderer readiness cannot overwrite the finalizing state. The main process awaits meeting shutdown before closing SQLite.
