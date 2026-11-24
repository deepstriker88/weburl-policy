# Changelog

## 0.1.2

- fix CLI execution through npm-generated `node_modules/.bin` links
- add an npm-style symlink regression test for the installed CLI entry point
- normalize the package `bin` path to the canonical npm form

## 0.1.1

- add exact hostname allowlists and explicit subdomain policy
- add exact trusted-origin policy
- add dependency-free streaming CLI for positional, stdin, and file inputs
- bound oversized input records and output backpressure
- fail cleanly when CLI output closes or errors

## 0.1.0

Initial public release

- dependency-free HTTP(S) URL policy checks
- WHATWG URL normalization through the Node.js standard library
- credentials rejected by default
- protocol allowlist
- leading/trailing whitespace and ASCII control-character rejection
- structured result API and stable error codes
- error messages that do not echo rejected URLs
