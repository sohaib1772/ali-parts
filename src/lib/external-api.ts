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
