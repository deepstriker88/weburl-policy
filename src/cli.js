#!/usr/bin/env node
import { inspectWebUrl } from "./index.js";
import { createReadStream, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const MAX_LINE = 65536;
function usage() {
  return "Usage: weburl-policy [--https-only] [--allowed-host HOST] [--allowed-origin ORIGIN] [--allow-subdomains] [--input FILE] [URL ...]\n" +
    "Without URLs, reads one URL per stdin line. Outputs one JSON result per line.\n" +
    "Exit: 0 all valid, 1 invalid URL, 2 invalid arguments or input failure.\n";
}
function parseArgs(args) {
  const options = {};
  const urls = [];
  let file = null;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help") return { help: true };
    if (arg === "--https-only") {
      options.allowedProtocols = ["https"];
    } else if (arg === "--allowed-host") {
      if (!args[i + 1] || args[i + 1].startsWith("--")) throw new Error("--allowed-host requires HOST");
      (options.allowedHosts ??= []).push(args[++i]);
    } else if (arg === "--allowed-origin") {
      if (!args[i + 1] || args[i + 1].startsWith("--")) throw new Error("--allowed-origin requires ORIGIN");
      (options.allowedOrigins ??= []).push(args[++i]);
    } else if (arg === "--input") {
      if (!args[i + 1] || args[i + 1].startsWith("--") || file !== null) throw new Error("--input requires exactly one FILE");
      file = args[++i];
    } else if (arg === "--allow-subdomains") {
      options.allowSubdomains = true;
    } else if (arg.startsWith("-")) {
      throw new Error("Unknown option: " + arg);
    } else {
      urls.push(arg);
    }
  }
  if (file !== null && urls.length) throw new Error("--input cannot be combined with positional URLs");
  // Validate configuration before reading unbounded input.
  inspectWebUrl("https://example.com", options);
  return { options, urls, file };
}
export async function run(args, input, out, err) {
  let parsed;
  try { parsed = parseArgs(args); }
  catch (error) { err.write(error.message + "\n" + usage()); return 2; }
  if (parsed.help) { out.write(usage()); return 0; }
  let invalid = false;
  // Respect Writable backpressure so slow consumers do not cause unbounded buffering.
  const writeResult = async (result) => {
    if (out.destroyed || out.writableEnded) throw new Error("Output stream closed");
    if (out.write(JSON.stringify(result) + "\n")) return;
    await new Promise((resolve, reject) => {
      const cleanup = () => {
        out.removeListener("drain", onDrain);
        out.removeListener("error", onError);
        out.removeListener("close", onClose);
      };
      const onDrain = () => { cleanup(); resolve(); };
      const onError = (error) => { cleanup(); reject(error); };
      const onClose = () => { cleanup(); reject(new Error("Output stream closed")); };
      out.once("drain", onDrain);
      out.once("error", onError);
      out.once("close", onClose);
      if (out.destroyed || out.writableEnded) onClose();
    });
  };
  const inspect = async (value) => {
    if (Buffer.byteLength(value, "utf8") > MAX_LINE) {
      await writeResult({ ok: false, url: null, error: "INPUT_TOO_LARGE" });
      invalid = true;
      return;
    }
    const result = inspectWebUrl(value, parsed.options);
    await writeResult(result);
    if (!result.ok) invalid = true;
  };
  if (parsed.file !== null) {
    input = createReadStream(parsed.file);
  }
  try {
    if (parsed.urls.length) {
      for (const value of parsed.urls) await inspect(value);
    } else {
      let chunks = [], bytes = 0, oversized = false;
      const emit = async () => {
        if (oversized) {
          await writeResult({ok:false, url:null, error:"INPUT_TOO_LARGE"});
          invalid = true;
        } else await inspect(Buffer.concat(chunks, bytes).toString("utf8").replace(/\r$/, ""));
        chunks = []; bytes = 0; oversized = false;
      };
      for await (const chunk of input) {
        const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        let offset = 0;
        for (let i = 0; i < data.length; i++) {
          if (data[i] !== 10) continue;
          const part = data.subarray(offset, i);
          if (!oversized && bytes + part.length <= MAX_LINE) {
            chunks.push(part); bytes += part.length;
          } else oversized = true;
          await emit();
          offset = i + 1;
        }
        const tail = data.subarray(offset);
        if (!oversized && bytes + tail.length <= MAX_LINE) {
          chunks.push(tail); bytes += tail.length;
        } else {
          oversized = true; chunks = []; bytes = 0;
        }
      }
      if (oversized || bytes) await emit();
    }
  } catch (error) {
    err.write("Input failure: " + error.message + "\n");
    return 2;
  }
  return invalid ? 1 : 0;
}
function isDirectExecution() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}
if (isDirectExecution()) {
  process.exitCode = await run(process.argv.slice(2), process.stdin, process.stdout, process.stderr);
}
