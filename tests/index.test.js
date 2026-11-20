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
