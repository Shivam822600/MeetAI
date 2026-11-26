# Windows audio implementation

No extra native executable is shipped. Electron's supported `setDisplayMediaRequestHandler` with `audio: 'loopback'` uses Chromium's native Windows WASAPI loopback implementation. Capture targets the default Windows playback device; select that device in Windows Sound Settings before starting or resuming. Per-application capture and explicit playback-endpoint selection are not exposed by this implementation.

The renderer requests display media only while a consented session is starting/listening. Main verifies the exact requesting frame. Chromium requires a screen video source to establish the stream; video tracks are stopped immediately and no frames are read, transmitted or saved. AudioWorklet processing outputs silent samples to the local audio graph to prevent feedback. Microphone capture is a separate getUserMedia stream with echo cancellation.

If hardware testing identifies a Chromium limitation, a separately audited helper could be added here. There is no untested helper or claimed fallback in this release.
