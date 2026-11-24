const DEFAULT_PROTOCOLS = Object.freeze(["http:", "https:"]);

const ERRORS = Object.freeze({
  INVALID_TYPE: "INVALID_TYPE",
  EMPTY_VALUE: "EMPTY_VALUE",
  SURROUNDING_WHITESPACE: "SURROUNDING_WHITESPACE",
  CONTROL_CHARACTER: "CONTROL_CHARACTER",
  PARSE_ERROR: "PARSE_ERROR",
  PROTOCOL_NOT_ALLOWED: "PROTOCOL_NOT_ALLOWED",
  CREDENTIALS_NOT_ALLOWED: "CREDENTIALS_NOT_ALLOWED",
  HOSTNAME_REQUIRED: "HOSTNAME_REQUIRED",
  HOSTNAME_NOT_ALLOWED: "HOSTNAME_NOT_ALLOWED",
  ORIGIN_NOT_ALLOWED: "ORIGIN_NOT_ALLOWED",
});

function fail(error) {
  return Object.freeze({ ok: false, url: null, error });
}

function normalizeOptions(options) {
  if (options === undefined) {
    return {
      allowedProtocols: new Set(DEFAULT_PROTOCOLS),
      allowCredentials: false,
      allowedHosts: null,
      allowedOrigins: null,
      allowSubdomains: false,
    };
  }

  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("options must be an object");
  }

  const allowCredentials = options.allowCredentials ?? false;
  if (typeof allowCredentials !== "boolean") {
    throw new TypeError("allowCredentials must be a boolean");
  }

  const allowSubdomains = options.allowSubdomains ?? false;
  if (typeof allowSubdomains !== "boolean") {
    throw new TypeError("allowSubdomains must be a boolean");
  }

  let allowedHosts = null;
  if (options.allowedHosts !== undefined) {
    if (!Array.isArray(options.allowedHosts) || options.allowedHosts.length === 0) {
      throw new TypeError("allowedHosts must be a non-empty array");
    }
    allowedHosts = new Set();
    for (const host of options.allowedHosts) {
      if (typeof host !== "string" || host !== host.trim() || !host || /[/?#@\s]/u.test(host) || (host.includes(":") && !/^\[[0-9a-fA-F:.]+\]$/.test(host))) {
        throw new TypeError("allowedHosts entries must be hostnames");
      }
      let normalized;
      try {
        normalized = new URL(`https://${host}/`).hostname.toLowerCase().replace(/\.$/, "");
      } catch {
        throw new TypeError("allowedHosts contains an invalid hostname");
      }
      if (!normalized || normalized.includes("%") || normalized.includes("..") ||
          !/^[a-z0-9.\-\[\]:]+$/u.test(normalized)) {
        throw new TypeError("allowedHosts contains an invalid hostname");
      }
      allowedHosts.add(normalized);
    }
  }

  let allowedOrigins = null;
  if (options.allowedOrigins !== undefined) {
    if (!Array.isArray(options.allowedOrigins) || options.allowedOrigins.length === 0) {
      throw new TypeError("allowedOrigins must be a non-empty array");
    }
    allowedOrigins = new Set();
    for (const origin of options.allowedOrigins) {
      if (typeof origin !== "string" || !origin || origin !== origin.trim() ||
          /[\u0000-\u0020\u007F]/u.test(origin)) {
        throw new TypeError("allowedOrigins entries must be absolute HTTP(S) origins");
      }
      let parsedOrigin;
      try {
        parsedOrigin = new URL(origin);
      } catch {
        throw new TypeError("allowedOrigins contains an invalid origin");
      }
      if (!DEFAULT_PROTOCOLS.includes(parsedOrigin.protocol) ||
          parsedOrigin.origin === "null" ||
          parsedOrigin.username || parsedOrigin.password ||
          parsedOrigin.pathname !== "/" || parsedOrigin.search || parsedOrigin.hash ||
          !/^[a-z][a-z0-9+.-]*:\/\//i.test(origin) ||
          origin.slice(origin.indexOf("://") + 3).includes("/")) {
        throw new TypeError("allowedOrigins entries must be absolute HTTP(S) origins");
      }
      allowedOrigins.add(parsedOrigin.origin);
    }
  }

  const rawProtocols = options.allowedProtocols ?? DEFAULT_PROTOCOLS;
  if (!Array.isArray(rawProtocols) || rawProtocols.length === 0) {
    throw new TypeError("allowedProtocols must be a non-empty array");
  }

  const allowedProtocols = new Set();
  for (const value of rawProtocols) {
    if (typeof value !== "string") {
      throw new TypeError("allowedProtocols entries must be strings");
    }

    let protocol = value.trim().toLowerCase();
    if (!/^[a-z][a-z0-9+.-]*:?$/.test(protocol)) {
      throw new TypeError("allowedProtocols contains an invalid protocol");
    }
    if (!protocol.endsWith(":")) {
      protocol += ":";
    }
    allowedProtocols.add(protocol);
  }

  return { allowedProtocols, allowCredentials, allowedHosts, allowedOrigins, allowSubdomains };
}

export class WebUrlPolicyError extends TypeError {
  constructor(code) {
    super(`Web URL policy check failed: ${code}`);
    this.name = "WebUrlPolicyError";
    this.code = code;
  }
}

export function inspectWebUrl(value, options) {
  const policy = normalizeOptions(options);

  if (typeof value !== "string") {
    return fail(ERRORS.INVALID_TYPE);
  }
  if (value.length === 0) {
    return fail(ERRORS.EMPTY_VALUE);
  }
  if (value !== value.trim()) {
    return fail(ERRORS.SURROUNDING_WHITESPACE);
  }
  if (/[\u0000-\u001F\u007F]/u.test(value)) {
    return fail(ERRORS.CONTROL_CHARACTER);
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return fail(ERRORS.PARSE_ERROR);
  }

  if (!policy.allowedProtocols.has(parsed.protocol.toLowerCase())) {
    return fail(ERRORS.PROTOCOL_NOT_ALLOWED);
  }
  if (!parsed.hostname) {
    return fail(ERRORS.HOSTNAME_REQUIRED);
  }
  if (policy.allowedHosts) {
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
    const permitted = [...policy.allowedHosts].some(
      (host) => hostname === host ||
        (policy.allowSubdomains && hostname.endsWith(`.${host}`)),
    );
    if (!permitted) {
      return fail(ERRORS.HOSTNAME_NOT_ALLOWED);
    }
  }
  if (policy.allowedOrigins && !policy.allowedOrigins.has(parsed.origin)) {
    return fail(ERRORS.ORIGIN_NOT_ALLOWED);
  }
  if (!policy.allowCredentials && (parsed.username || parsed.password)) {
    return fail(ERRORS.CREDENTIALS_NOT_ALLOWED);
  }

  return Object.freeze({
    ok: true,
    url: parsed.href,
    error: null,
  });
}

export function isWebUrl(value, options) {
  return inspectWebUrl(value, options).ok;
}

export function assertWebUrl(value, options) {
  const result = inspectWebUrl(value, options);
  if (!result.ok) {
    throw new WebUrlPolicyError(result.error);
  }
  return result.url;
}

export { DEFAULT_PROTOCOLS, ERRORS };
