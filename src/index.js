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
});

function fail(error) {
  return Object.freeze({ ok: false, url: null, error });
}

function normalizeOptions(options) {
  if (options === undefined) {
    return {
      allowedProtocols: new Set(DEFAULT_PROTOCOLS),
      allowCredentials: false,
    };
  }

  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("options must be an object");
  }

  const allowCredentials = options.allowCredentials ?? false;
  if (typeof allowCredentials !== "boolean") {
    throw new TypeError("allowCredentials must be a boolean");
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

  return { allowedProtocols, allowCredentials };
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
