# weburl-policy

Dependency-free HTTP(S) URL policy checks for modern Node.js using the built-in WHATWG `URL` parser

## Why

Use when an application needs a strict web-URL policy without adding a runtime dependency or maintaining a custom URL parser

Defaults:

- allow `http:` and `https:`
- reject embedded username/password credentials
- reject leading/trailing whitespace
- reject ASCII control characters
- return a normalized URL on success
- return a stable structured error code on failure
- never echo a rejected URL in `WebUrlPolicyError` messages

## Usage

```js
import {
  inspectWebUrl,
  isWebUrl,
  assertWebUrl,
} from "weburl-policy";

inspectWebUrl("https://Example.COM/a");
// { ok: true, url: "https://example.com/a", error: null }

isWebUrl("ftp://example.com");
// false

assertWebUrl("https://example.com");
// "https://example.com/"
```

Restrict callers to HTTPS:

```js
inspectWebUrl("https://example.com", {
  allowedProtocols: ["https"],
});
```

Credentials are disabled by default and require explicit opt-in:

```js
inspectWebUrl("https://user:pass@example.com", {
  allowCredentials: true,
});
```

## Scope

This is intentionally not a drop-in compatibility layer for `valid-url`. It is a separately designed policy-oriented API for modern Node.js web URLs

## Security boundary

A syntactically valid URL is not automatically safe to request. This package does not resolve DNS, block private IP addresses, follow redirects, or provide SSRF protection

## Runtime

Node.js 18 or newer, no runtime dependencies
