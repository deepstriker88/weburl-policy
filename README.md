# weburl-policy

A small, dependency-free Node.js package for checking whether a value is an allowed HTTP(S) URL

It is designed for cases where you want more than a simple true/false check: it can normalize valid URLs, reject unsafe-looking input such as embedded credentials, and return stable error codes

## What it does

By default, `weburl-policy`:

- accepts only `http:` and `https:`
- rejects usernames and passwords inside URLs
- rejects leading or trailing whitespace
- rejects ASCII control characters
- requires a hostname
- returns a normalized URL when valid
- returns a stable error code when invalid
- has zero runtime dependencies

Example:

```js
inspectWebUrl("https://Example.COM/a");
// { ok: true, url: "https://example.com/a", error: null }
```

## Quick start

### 1. Install

```bash
npm install weburl-policy
```

Requirements: Node.js 18 or newer

### 2. Copy and run this example

Create `example.mjs`:

```js
import { inspectWebUrl } from "weburl-policy";

const result = inspectWebUrl("https://Example.COM/a");

console.log(result);
```

Run it:

```bash
node example.mjs
```

Expected output:

```js
{ ok: true, url: 'https://example.com/a', error: null }
```

That is enough for the most common use case

### Restrict links to trusted hostnames

For callback URLs, approved integration endpoints, or customer-configured links,
use an explicit hostname allowlist:

```js
import { inspectWebUrl } from "weburl-policy";

inspectWebUrl("https://api.example.com/v1", {
  allowedHosts: ["example.com"],
  allowSubdomains: true,
});
// { ok: true, url: "https://api.example.com/v1", error: null }

inspectWebUrl("https://example.com.attacker.test", {
  allowedHosts: ["example.com"],
  allowSubdomains: true,
});
// { ok: false, url: null, error: "HOSTNAME_NOT_ALLOWED" }
```

`allowedHosts` matches exact hostnames by default. `allowSubdomains: true`
also matches descendants at DNS label boundaries, not arbitrary suffixes.
Hostnames are normalized (including internationalized names) before comparison.
This is a URL string policy, **not** an SSRF defense: it does not resolve DNS,
block private IP ranges, or protect against DNS rebinding or redirects.
For server-side HTTP requests, independently validate resolved addresses,
redirect targets and network egress.

## Common examples

### Just check true or false

Use `isWebUrl()` when you only need a boolean:

```js
import { isWebUrl } from "weburl-policy";

console.log(isWebUrl("https://example.com"));
// true

console.log(isWebUrl("ftp://example.com"));
// false
```

### Get the normalized URL or an error code

Use `inspectWebUrl()` when you want to know why validation failed:

```js
import { inspectWebUrl } from "weburl-policy";

console.log(inspectWebUrl("https://Example.COM/path"));
// { ok: true, url: "https://example.com/path", error: null }

console.log(inspectWebUrl("ftp://example.com/file"));
// { ok: false, url: null, error: "PROTOCOL_NOT_ALLOWED" }
```

### Throw an error when the URL is invalid

Use `assertWebUrl()` when invalid input should stop the current operation:

```js
import { assertWebUrl } from "weburl-policy";

const url = assertWebUrl("https://EXAMPLE.com");

console.log(url);
// https://example.com/
```

Invalid input throws `WebUrlPolicyError` with a stable `code` property

### Allow HTTPS only

```js
import { inspectWebUrl } from "weburl-policy";

console.log(
  inspectWebUrl("http://example.com", {
    allowedProtocols: ["https"],
  }),
);
// { ok: false, url: null, error: "PROTOCOL_NOT_ALLOWED" }
```

You can write protocols as `"https"` or `"https:"`

### Allow credentials explicitly

Credentials are rejected by default:

```js
import { inspectWebUrl } from "weburl-policy";

console.log(inspectWebUrl("https://user:pass@example.com"));
// { ok: false, url: null, error: "CREDENTIALS_NOT_ALLOWED" }
```

Only enable them when your application really needs them:

```js
inspectWebUrl("https://user:pass@example.com", {
  allowCredentials: true,
});
```

## API

### `inspectWebUrl(value, options?)`

Best default choice

Returns:

```js
{
  ok: true | false,
  url: "normalized URL" | null,
  error: null | "ERROR_CODE"
}
```

Available options:

| Option | Default | Meaning |
| --- | --- | --- |
| `allowedProtocols` | `["http:", "https:"]` | Protocols the URL may use |
| `allowCredentials` | `false` | Whether `user:password@` is allowed |

Possible validation error codes:

- `INVALID_TYPE`
- `EMPTY_VALUE`
- `SURROUNDING_WHITESPACE`
- `CONTROL_CHARACTER`
- `PARSE_ERROR`
- `PROTOCOL_NOT_ALLOWED`
- `CREDENTIALS_NOT_ALLOWED`
- `HOSTNAME_REQUIRED`

### `isWebUrl(value, options?)`

Returns only `true` or `false`

Use this for simple conditions such as:

```js
if (isWebUrl(input)) {
  // valid under the selected policy
}
```

### `assertWebUrl(value, options?)`

Returns the normalized URL when valid

Throws `WebUrlPolicyError` when invalid:

```js
import { assertWebUrl, WebUrlPolicyError } from "weburl-policy";

try {
  const url = assertWebUrl("ftp://example.com");
} catch (error) {
  if (error instanceof WebUrlPolicyError) {
    console.log(error.code);
    // PROTOCOL_NOT_ALLOWED
  }
}
```

The exception message does not echo the rejected URL

## Requirements

- Node.js 18 or newer
- ECMAScript modules (ESM)
- no runtime dependencies

For normal ESM projects:

```js
import { isWebUrl } from "weburl-policy";
```

If your project still uses CommonJS, use dynamic import:

```js
async function main() {
  const { isWebUrl } = await import("weburl-policy");
  console.log(isWebUrl("https://example.com"));
}

main();
```

## Security and limitations

A URL passing this package means only that it is syntactically valid and satisfies the configured URL policy

It does **not** mean the destination is safe to request

This package does not:

- resolve DNS
- detect or block private/internal IP addresses
- follow or validate redirects
- check whether a server is reachable
- detect phishing or malicious domains
- provide complete SSRF protection

If user-controlled URLs are fetched by a server, additional network-level SSRF protections are still required

## Troubleshooting

### `require("weburl-policy")` does not work

This package is ESM

Use:

```js
import { isWebUrl } from "weburl-policy";
```

or use dynamic `import()` from CommonJS as shown above

### A URL with spaces is rejected

Leading or trailing whitespace is rejected intentionally instead of being silently trimmed

Trim the value in your own application only if that behavior is appropriate:

```js
const cleaned = input.trim();
const result = inspectWebUrl(cleaned);
```

### An FTP or custom-protocol URL is rejected

Only HTTP and HTTPS are allowed by default

Pass an explicit allowlist if you intentionally support another protocol:

```js
inspectWebUrl("ftp://example.com/file", {
  allowedProtocols: ["ftp"],
});
```

### I need SSRF protection

This package is not an SSRF firewall

Use it as one input-validation layer and add DNS/IP/redirect/network controls before making requests to user-supplied URLs

## License

MIT


## Command-line validation (Node.js 18+)

After installation, validate individual URLs:

```bash
npx weburl-policy --https-only --allowed-host example.com https://example.com/a
```

For local bulk validation, stream one URL per line:

```bash
printf 'https://example.com\nftp://example.com\n' | weburl-policy
```

The command emits one JSON object per URL and does not send input to a remote service
Exit code 0 means every URL passed, 1 means at least one failed, and 2 means invalid options or an input failure
The input limit is 64 KiB per URL; oversized lines return `INPUT_TOO_LARGE`
Do not treat URL syntax validation as protection against SSRF, DNS rebinding, redirects, or OAuth redirect URI mismatch

## Exact origin restrictions for callback URLs

Use allowedOrigins to require a trusted **scheme + hostname + port**.
Unlike allowedHosts, an origin policy distinguishes HTTP from HTTPS and
ports 443 from 8443. Default ports and internationalized hostnames are
normalized using the standard WHATWG URL parser.

Example:

    import { inspectWebUrl } from "weburl-policy";
    const policy = { allowedOrigins: ["https://app.example.com:443"] };
    inspectWebUrl("https://app.example.com/callback?code=abc", policy).ok; // true
    inspectWebUrl("http://app.example.com/callback", policy).error; // ORIGIN_NOT_ALLOWED

Entries must be HTTP(S) origins without credentials, path, query or fragment.
The option is optional and combines with allowedHosts when both are set.
This is an **origin check**, not an OAuth redirect URI equality check:
the path and query are not constrained. It does not perform DNS resolution,
block private addresses, follow redirects or guarantee SSRF protection.

### CLI streaming limits

The CLI accepts `--allowed-origin ORIGIN` and `--allow-subdomains`. Standard input is processed as newline-delimited URLs with a 65,536-byte per-line limit. Overlong lines are discarded incrementally and reported as `INPUT_TOO_LARGE`. This is not a total process-memory guarantee.

## Validate a URL list file from the command line

Use the packaged CLI without writing JavaScript:

```bash
printf 'https://example.com\nhttp://example.com\n' > urls.txt
weburl-policy --input urls.txt --https-only > results.jsonl
```

Each line of `results.jsonl` contains one structured JSON result, in input order.
Exit code 0 means all valid, 1 means at least one URL failed, and 2 means
invalid arguments or a file read error. Lines exceeding 65,536 bytes are
reported as `INPUT_TOO_LARGE` without echoing the oversized content.
`--input` cannot be combined with positional URLs. Input files are streamed
without loading the whole file into memory. This tool checks URL strings, not
the safety of fetching remote resources.

<!-- eztoolgo-voluntary-support:start -->
## Support development

If this tool saves you time, you can [buy me a coffee](https://buymeacoffee.com/eztoolgo). Voluntary support does not unlock features or purchase service access.
<!-- eztoolgo-voluntary-support:end -->
