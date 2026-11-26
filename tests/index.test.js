import test from "node:test";
import assert from "node:assert/strict";

import {
  WebUrlPolicyError,
  assertWebUrl,
  inspectWebUrl,
  isWebUrl,
} from "../src/index.js";

test("accepts and normalizes an HTTPS URL", () => {
  const result = inspectWebUrl("https://Example.COM/a?b=1");
  assert.deepEqual(result, {
    ok: true,
    url: "https://example.com/a?b=1",
    error: null,
  });
});

test("accepts HTTP by default", () => {
  assert.equal(isWebUrl("http://example.com"), true);
});

test("rejects a relative URL", () => {
  assert.equal(inspectWebUrl("/relative").error, "PARSE_ERROR");
});

test("rejects a protocol outside the default allowlist", () => {
  assert.equal(
    inspectWebUrl("ftp://example.com/file").error,
    "PROTOCOL_NOT_ALLOWED",
  );
});

test("supports a caller-defined protocol allowlist", () => {
  assert.equal(
    inspectWebUrl("http://example.com", { allowedProtocols: ["https"] }).error,
    "PROTOCOL_NOT_ALLOWED",
  );
  assert.equal(
    inspectWebUrl("https://example.com", { allowedProtocols: ["https"] }).ok,
    true,
  );
});

test("rejects credentials by default", () => {
  assert.equal(
    inspectWebUrl("https://user:pass@example.com").error,
    "CREDENTIALS_NOT_ALLOWED",
  );
});

test("allows credentials only when explicitly enabled", () => {
  const result = inspectWebUrl("https://user:pass@example.com", {
    allowCredentials: true,
  });
  assert.equal(result.ok, true);
});

test("rejects surrounding whitespace rather than silently trimming", () => {
  assert.equal(
    inspectWebUrl(" https://example.com").error,
    "SURROUNDING_WHITESPACE",
  );
});

test("rejects ASCII control characters", () => {
  assert.equal(
    inspectWebUrl("https://example.com/\npath").error,
    "CONTROL_CHARACTER",
  );
});

test("returns INVALID_TYPE for non-string input", () => {
  assert.equal(
    inspectWebUrl(new URL("https://example.com")).error,
    "INVALID_TYPE",
  );
});

test("assertWebUrl returns a normalized URL", () => {
  assert.equal(assertWebUrl("https://EXAMPLE.com"), "https://example.com/");
});

test("assertWebUrl throws a stable error without echoing the input URL", () => {
  assert.throws(
    () => assertWebUrl("ftp://secret.example/private"),
    (error) => {
      assert.equal(error instanceof WebUrlPolicyError, true);
      assert.equal(error.code, "PROTOCOL_NOT_ALLOWED");
      assert.equal(error.message.includes("secret.example"), false);
      return true;
    },
  );
});

test("rejects invalid option shapes", () => {
  assert.throws(() => inspectWebUrl("https://example.com", null), TypeError);
  assert.throws(
    () => inspectWebUrl("https://example.com", { allowedProtocols: [] }),
    TypeError,
  );
  assert.throws(
    () => inspectWebUrl("https://example.com", { allowCredentials: "yes" }),
    TypeError,
  );
});

test("restricts URLs to exact allowed hosts", () => {
  const opts = { allowedHosts: ["EXAMPLE.com"] };
  assert.equal(inspectWebUrl("https://example.com/a", opts).ok, true);
  assert.equal(inspectWebUrl("https://other.example.com", opts).error, "HOSTNAME_NOT_ALLOWED");
  assert.equal(inspectWebUrl("https://example.com.evil.test", opts).error, "HOSTNAME_NOT_ALLOWED");
});

test("explicit subdomain policy honors DNS label boundaries", () => {
  const opts = { allowedHosts: ["example.com"], allowSubdomains: true };
  assert.equal(isWebUrl("https://a.b.example.com", opts), true);
  assert.equal(isWebUrl("https://badexample.com", opts), false);
  assert.equal(isWebUrl("https://example.com.evil.test", opts), false);
});

test("host policy normalizes IDN and trailing dots", () => {
  const opts = { allowedHosts: ["bücher.example"] };
  assert.equal(isWebUrl("https://xn--bcher-kva.example/", opts), true);
  assert.equal(isWebUrl("https://bücher.example./", opts), true);
});

test("host policy supports IPv4 and IPv6 exact matches", () => {
  assert.equal(isWebUrl("https://127.0.0.1", { allowedHosts: ["127.0.0.1"] }), true);
  assert.equal(isWebUrl("http://[::1]", { allowedHosts: ["[::1]"] }), true);
  assert.equal(isWebUrl("http://[::1]", { allowedHosts: ["127.0.0.1"] }), false);
});

test("host policy rejects malformed configuration", () => {
  for (const allowedHosts of [[], ["https://example.com"], ["example.com/path"], ["a b"], [123]]) {
    assert.throws(() => inspectWebUrl("https://example.com", { allowedHosts }), TypeError);
  }
  assert.throws(() => inspectWebUrl("https://example.com", { allowSubdomains: 1 }), TypeError);
});

test("allowedOrigins matches exact scheme, host and effective port", () => {
  const opts = { allowedOrigins: ["https://EXAMPLE.com:443", "http://localhost:8080"] };
  assert.equal(isWebUrl("https://example.com/callback?code=1", opts), true);
  assert.equal(isWebUrl("https://example.com:443/callback", opts), true);
  assert.equal(isWebUrl("http://localhost:8080/callback", opts), true);
  for (const url of [
    "http://example.com/callback",
    "https://example.com:444/callback",
    "https://sub.example.com/callback",
    "http://localhost:8081/callback",
    "https://example.com.evil.test/callback",
  ]) {
    assert.equal(inspectWebUrl(url, opts).error, "ORIGIN_NOT_ALLOWED", url);
  }
});

test("allowedOrigins normalizes IDN and IPv6 origins", () => {
  assert.equal(isWebUrl("https://xn--bcher-kva.example/", {
    allowedOrigins: ["https://bücher.example"],
  }), true);
  assert.equal(isWebUrl("http://[::1]:8080/", {
    allowedOrigins: ["http://[::1]:8080"],
  }), true);
});

test("allowedOrigins rejects malformed origins and URL-like paths", () => {
  for (const origin of [
    "example.com", "ftp://example.com", "https://user@example.com",
    "https://example.com/path", "https://example.com/?q=1",
    "https://example.com/#frag", "https://example.com.evil.test@trusted.test",
    "https://example.com/", "https://example.com:bad", "null", 42,
  ]) {
    assert.throws(() => inspectWebUrl("https://example.com", {
      allowedOrigins: [origin],
    }), TypeError, String(origin));
  }
  assert.throws(() => isWebUrl("https://example.com", { allowedOrigins: [] }), TypeError);
});

test("allowedOrigins and allowedHosts are both enforced", () => {
  const opts = {
    allowedHosts: ["example.com"],
    allowedOrigins: ["https://example.com:8443"],
  };
  assert.equal(isWebUrl("https://example.com:8443/a", opts), true);
  assert.equal(inspectWebUrl("https://example.com/a", opts).error, "ORIGIN_NOT_ALLOWED");
  assert.equal(inspectWebUrl("https://other.com/a", opts).error, "HOSTNAME_NOT_ALLOWED");
});

test("allowlist rejects ambiguous URL parser normalization of configured hosts and origins", () => {
  for (const host of ["example.com\\ignored", "%65xample.com"]) {
    assert.throws(() => inspectWebUrl("https://example.com", {allowedHosts:[host]}), TypeError);
  }
  assert.throws(() => inspectWebUrl("https://example.com", {allowedOrigins:["https://example.com\\"]}), TypeError);
  assert.equal(inspectWebUrl("https://bücher.example/", {allowedHosts:["bücher.example"]}).ok,true);
});
