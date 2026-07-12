export type ExternalApiEndpoint = {
  id: string;
  name: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
};

export type ExternalApiConfig = {
  baseUrl: string;
  keyHeader: string;
  apiKey: string;
  endpoints: ExternalApiEndpoint[];
};

const HEADER_NAME_RE = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;
const PATH_RE = /^\/[A-Za-z0-9\-._~!$&'()*+,;=:@/%?{}=&]*$/;
const METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"] as const;

export type ExternalApiValidationError = { field: string; message: string };

export function validateExternalApiConfig(cfg: ExternalApiConfig): ExternalApiValidationError[] {
  const errors: ExternalApiValidationError[] = [];

  const baseUrl = cfg.baseUrl.trim();
  if (!baseUrl) {
    errors.push({ field: "baseUrl", message: "Base URL مطلوب" });
  } else {
    try {
      const u = new URL(baseUrl);
      if (u.protocol !== "https:" && u.protocol !== "http:") {
        errors.push({ field: "baseUrl", message: "Base URL يجب أن يبدأ بـ http أو https" });
      }
      if (u.protocol === "http:" && u.hostname !== "localhost" && u.hostname !== "127.0.0.1") {
        errors.push({ field: "baseUrl", message: "استخدم https للأمان (http مسموح فقط لـ localhost)" });
      }
    } catch {
      errors.push({ field: "baseUrl", message: "صيغة Base URL غير صحيحة" });
    }
  }

  const header = cfg.keyHeader.trim();
  if (!header) {
    errors.push({ field: "keyHeader", message: "اسم Header مطلوب" });
  } else if (!HEADER_NAME_RE.test(header)) {
    errors.push({ field: "keyHeader", message: "اسم Header يحتوي رموزًا غير مسموحة" });
  } else if (header.length > 128) {
    errors.push({ field: "keyHeader", message: "اسم Header طويل جداً" });
  }

  const key = cfg.apiKey.trim();
  if (!key) {
    errors.push({ field: "apiKey", message: "مفتاح API مطلوب" });
  } else if (key.length < 8) {
    errors.push({ field: "apiKey", message: "مفتاح API قصير جداً (٨ أحرف على الأقل)" });
  } else if (key.length > 4096) {
    errors.push({ field: "apiKey", message: "مفتاح API طويل جداً" });
  } else if (/\s/.test(key)) {
    errors.push({ field: "apiKey", message: "مفتاح API يحتوي على مسافات" });
  }

  const seenIds = new Set<string>();
  const seenSigs = new Set<string>();
  cfg.endpoints.forEach((ep, i) => {
    const scope = `endpoints[${i}]`;
    if (!ep.id || seenIds.has(ep.id)) {
      errors.push({ field: `${scope}.id`, message: "معرّف endpoint مكرر" });
    } else {
      seenIds.add(ep.id);
    }
    const name = (ep.name || "").trim();
    if (!name) {
      errors.push({ field: `${scope}.name`, message: `الاسم مطلوب (endpoint #${i + 1})` });
    } else if (name.length > 60) {
      errors.push({ field: `${scope}.name`, message: `الاسم طويل جداً (endpoint #${i + 1})` });
    }
    if (!METHODS.includes(ep.method)) {
      errors.push({ field: `${scope}.method`, message: `Method غير صالح (endpoint #${i + 1})` });
    }
    const path = (ep.path || "").trim();
    if (!path) {
      errors.push({ field: `${scope}.path`, message: `المسار مطلوب (endpoint #${i + 1})` });
    } else if (!path.startsWith("/")) {
      errors.push({ field: `${scope}.path`, message: `المسار يجب أن يبدأ بـ / (endpoint #${i + 1})` });
    } else if (path.length > 500) {
      errors.push({ field: `${scope}.path`, message: `المسار طويل جداً (endpoint #${i + 1})` });
    } else if (!PATH_RE.test(path)) {
      errors.push({ field: `${scope}.path`, message: `المسار يحتوي رموزًا غير صالحة (endpoint #${i + 1})` });
    }
    const sig = `${ep.method} ${path}`;
    if (path && seenSigs.has(sig)) {
      errors.push({ field: `${scope}.path`, message: `Endpoint مكرر: ${sig}` });
    } else if (path) {
      seenSigs.add(sig);
    }
  });

  if (cfg.endpoints.length > 50) {
    errors.push({ field: "endpoints", message: "الحد الأقصى ٥٠ endpoint" });
  }

  return errors;
}

export const DEFAULT_EXTERNAL_API_CONFIG: ExternalApiConfig = {
  baseUrl: "",
  keyHeader: "Authorization",
  apiKey: "",
  endpoints: [],
};

export const EXTERNAL_API_SETTING_KEYS = {
  baseUrl: "external_api_base_url",
  keyHeader: "external_api_key_header",
  apiKey: "external_api_key",
  endpoints: "external_api_endpoints",
};

export function parseExternalApiConfig(settings: Record<string, string>): ExternalApiConfig {
  let endpoints: ExternalApiEndpoint[] = [];
  try {
    const parsed = JSON.parse(settings[EXTERNAL_API_SETTING_KEYS.endpoints] || "[]");
    if (Array.isArray(parsed)) endpoints = parsed;
  } catch {
    endpoints = [];
  }
  return {
    baseUrl: settings[EXTERNAL_API_SETTING_KEYS.baseUrl] || "",
    keyHeader: settings[EXTERNAL_API_SETTING_KEYS.keyHeader] || "Authorization",
    apiKey: settings[EXTERNAL_API_SETTING_KEYS.apiKey] || "",
    endpoints,
  };
}

export function serializeExternalApiConfig(config: ExternalApiConfig): { key: string; value: string }[] {
  return [
    { key: EXTERNAL_API_SETTING_KEYS.baseUrl, value: config.baseUrl.trim() },
    { key: EXTERNAL_API_SETTING_KEYS.keyHeader, value: config.keyHeader.trim() || "Authorization" },
    { key: EXTERNAL_API_SETTING_KEYS.apiKey, value: config.apiKey.trim() },
    { key: EXTERNAL_API_SETTING_KEYS.endpoints, value: JSON.stringify(config.endpoints) },
  ];
}
