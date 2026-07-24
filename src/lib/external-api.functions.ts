import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdminOtp } from "@/integrations/supabase/require-admin-otp";
import {
  type ExternalApiConfig,
  type ExternalApiEndpoint,
  EXTERNAL_API_SETTING_KEYS,
  parseExternalApiConfig,
} from "./external-api";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden");
}

async function loadConfig(ctx: { supabase: any }): Promise<ExternalApiConfig> {
  const { data, error } = await ctx.supabase
    .from("app_settings")
    .select("key, value")
    .in("key", [
      EXTERNAL_API_SETTING_KEYS.baseUrl,
      EXTERNAL_API_SETTING_KEYS.keyHeader,
      EXTERNAL_API_SETTING_KEYS.apiKey,
      EXTERNAL_API_SETTING_KEYS.endpoints,
    ]);
  if (error) throw new Error(error.message);
  const map: Record<string, string> = {};
  for (const row of data ?? []) map[row.key] = row.value ?? "";
  return parseExternalApiConfig(map);
}

async function executeExternalApiCall(
  config: ExternalApiConfig,
  endpointId: string,
  body?: Record<string, unknown>,
  query?: Record<string, string>,
) {
  const endpoint = config.endpoints.find((e) => e.id === endpointId);
  if (!endpoint) throw new Error("Endpoint not found");

  const apiKey = config.apiKey || process.env.EXTERNAL_API_KEY || "";
  if (!apiKey) throw new Error("API key not configured");

  const url = new URL(endpoint.path, config.baseUrl);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.set(k, v);
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.keyHeader.toLowerCase() === "authorization") {
    headers[config.keyHeader] = `Bearer ${apiKey}`;
  } else {
    headers[config.keyHeader] = apiKey;
  }

  const response = await fetch(url.toString(), {
    method: endpoint.method,
    headers,
    body: endpoint.method !== "GET" && body ? JSON.stringify(body) : undefined,
  });

  let responseBody = "";
  const contentType = response.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/json")) {
      responseBody = JSON.stringify(await response.json());
    } else {
      responseBody = await response.text();
    }
  } catch {
    responseBody = "";
  }

  return {
    status: response.status,
    ok: response.ok,
    body: responseBody,
  };
}

export const getExternalApiConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    await requireAdminOtp(context);
    return await loadConfig(context);
  });

const TestInput = z.object({
  endpointId: z.string(),
});

export const testExternalApi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TestInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    await requireAdminOtp(context);
    const config = await loadConfig(context);
    return await executeExternalApiCall(config, data.endpointId);
  });
