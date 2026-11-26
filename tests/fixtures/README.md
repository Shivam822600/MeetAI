# Local test certificate

`localhost-test.crt` and `localhost-test.key` are a public, disposable self-signed certificate/key pair for the companion server integration tests. They authenticate only `127.0.0.1`; test clients explicitly allow the self-signed certificate. Never reuse this key or trust this certificate for real sharing.
