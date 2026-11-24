import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
const cli = new URL("../src/cli.js", import.meta.url).pathname;
function invoke(args, input) {
  return spawnSync(process.execPath, [cli, ...args], { input, encoding: "utf8" });
}
test("CLI validates positional URLs and exits 1 on invalid values", () => {
  const r = invoke(["https://Example.com", "ftp://bad.test"]);
  assert.equal(r.status, 1);
  assert.deepEqual(r.stdout.trim().split("\n").map(JSON.parse).map(x => x.error), [null, "PROTOCOL_NOT_ALLOWED"]);
});
test("CLI streams stdin and handles CRLF", () => {
  const r = invoke([], "https://EXAMPLE.com\r\nhttp://example.com\n");
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim().split("\n").length, 2);
});
test("CLI applies HTTPS and hostname restrictions", () => {
  const r = invoke(["--https-only", "--allowed-host", "example.com", "https://example.com", "http://example.com", "https://evil.test"]);
  assert.equal(r.status, 1);
  assert.deepEqual(r.stdout.trim().split("\n").map(JSON.parse).map(x => x.error), [null, "PROTOCOL_NOT_ALLOWED", "HOSTNAME_NOT_ALLOWED"]);
});
test("CLI rejects invalid arguments with exit 2", () => {
  for (const args of [["--wrong"], ["--allowed-host"], ["--allowed-host", "https://example.com"]]) {
    const r = invoke(args);
    assert.equal(r.status, 2, r.stderr);
    assert.equal(r.stdout, "");
  }
});
test("CLI bounds line size without echoing input", () => {
  const r = invoke([], "x".repeat(65537) + "\nhttps://example.com\n");
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.stdout.split("\n")[0]).error, "INPUT_TOO_LARGE");
  assert.equal(JSON.parse(r.stdout.split("\n")[1]).ok, true);
});
test("CLI --help prints usage", () => {
  const r = invoke(["--help"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage: weburl-policy/);
});

test("CLI supports origin restriction and subdomain flag", () => {
  const r = invoke(["--allowed-origin", "https://example.com", "https://example.com/a", "http://example.com/a"]);
  assert.equal(r.status, 1);
  assert.deepEqual(r.stdout.trim().split("\n").map(JSON.parse).map(x => x.error), [null, "ORIGIN_NOT_ALLOWED"]);
  assert.equal(invoke(["--allowed-host", "example.com", "--allow-subdomains", "https://api.example.com"]).status, 0);
});
test("CLI drops multi-megabyte newline-free line then continues", () => {
  const r = invoke([], "x".repeat(2*1024*1024)+"\nhttps://example.com\n");
  assert.equal(r.status, 1);
  assert.deepEqual(r.stdout.trim().split("\n").map(JSON.parse).map(x => x.error), ["INPUT_TOO_LARGE", null]);
});

test("CLI streams a local URL list file with bounded lines", () => {
  const dir = mkdtempSync(join(tmpdir(), "weburl-cli-"));
  try {
    const path = join(dir, "urls.txt");
    writeFileSync(path, "https://example.com\n" + "x".repeat(100000) + "\nhttp://example.com\n");
    const r = invoke(["--input", path, "--https-only"]);
    assert.equal(r.status, 1, r.stderr);
    assert.deepEqual(r.stdout.trim().split("\n").map(JSON.parse).map(x => x.error),
      [null, "INPUT_TOO_LARGE", "PROTOCOL_NOT_ALLOWED"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test("CLI reports missing files as input failures", () => {
  const r = invoke(["--input", "/nonexistent/weburl-policy-urls.txt"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Input failure:/);
});
test("CLI rejects ambiguous file and positional inputs", () => {
  assert.equal(invoke(["--input", "urls.txt", "https://example.com"]).status, 2);
  assert.equal(invoke(["--input", "a", "--input", "b"]).status, 2);
});

test("CLI honors output backpressure before reading subsequent records", async () => {
  const { run } = await import("../src/cli.js");
  const { EventEmitter } = await import("node:events");
  const { Readable } = await import("node:stream");
  class SlowOutput extends EventEmitter {
    constructor() { super(); this.records = []; this.waiting = false; }
    write(chunk) {
      assert.equal(this.waiting, false, "must wait for drain before another write");
      this.records.push(JSON.parse(chunk));
      this.waiting = true;
      setImmediate(() => { this.waiting = false; this.emit("drain"); });
      return false;
    }
  }
  const output = new SlowOutput();
  const stderr = { write: () => { throw new Error("unexpected stderr"); } };
  const input = Readable.from(["https://example.com\nhttps://other.test\n"]);
  assert.equal(await run([], input, output, stderr), 0);
  assert.equal(output.records.length, 2);
  assert.equal(output.records[0].ok, true);
  assert.equal(output.records[1].ok, true);
});


test("CLI exits 2 when output closes before drain", async () => {
  const { run } = await import("../src/cli.js");
  const { EventEmitter } = await import("node:events");
  const { Readable } = await import("node:stream");
  class ClosedOutput extends EventEmitter {
    write() {
      setImmediate(() => this.emit("close"));
      return false;
    }
  }
  let errors = "";
  const code = await run([], Readable.from(["https://example.com\n"]), new ClosedOutput(), {
    write(message) { errors += message; }
  });
  assert.equal(code, 2);
  assert.match(errors, /Output stream closed/);
});

test("CLI exits 2 when output emits error while waiting for drain", async () => {
  const { run } = await import("../src/cli.js");
  const { EventEmitter } = await import("node:events");
  const { Readable } = await import("node:stream");
  class BrokenOutput extends EventEmitter {
    write() {
      setImmediate(() => this.emit("error", new Error("disk full")));
      return false;
    }
  }
  let errors = "";
  const code = await run([], Readable.from(["https://example.com\n"]), new BrokenOutput(), {
    write(message) { errors += message; }
  });
  assert.equal(code, 2);
  assert.match(errors, /disk full/);
});
