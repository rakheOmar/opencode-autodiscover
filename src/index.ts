import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { Model } from "@opencode-ai/plugin";
import { Plugin } from "@opencode-ai/plugin";

import { fetchModels } from "./fetcher.js";
import { matchesFilter } from "./filter.js";
import {
  clearCache as clearModelsDevCache,
  lookupModelMetadata as lookupModelsDevMetadata,
} from "./modelsdev.js";
import {
  clearCache as clearOpenRouterCache,
  lookupModelMetadata as lookupOpenRouterMetadata,
} from "./openrouter.js";
import { isValidUrl } from "./security.js";
import type {
  DiscoveredModel,
  ModelsDevModel,
  OpenRouterModel,
} from "./types.js";

const PROVIDER_PACKAGE = "@opencode-ai/ai/providers/openai-compatible";

interface CatalogProviderItem {
  provider?: {
    headers?: Record<string, string>;
    id?: unknown;
    name?: string;
    npm?: string;
    options?: Record<string, unknown>;
    package?: string;
    settings?: Record<string, unknown>;
  };
}
interface EndpointConfig {
  id: string;
  baseURL: string;
  name?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  include?: string[];
  exclude?: string[];
}

interface EnrichedModel {
  model: DiscoveredModel;
  openrouter: OpenRouterModel | null;
  modelsdev: ModelsDevModel | null;
}

interface EndpointResult {
  endpoint: EndpointConfig;
  models: EnrichedModel[];
}

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

// Backward-compatible env fallback: OPENCODE_LOCAL_<ID>_API_KEY.
const apiKeyFromEnvironment = (id: string): string | undefined =>
  process.env[
    `OPENCODE_LOCAL_${id.toUpperCase().replaceAll("-", "_")}_API_KEY`
  ];

const parseEndpoints = (
  options: Readonly<Record<string, unknown>>
): EndpointConfig[] => {
  if (!Array.isArray(options.endpoints)) {
    return [];
  }

  const endpoints: EndpointConfig[] = [];
  for (const entry of options.endpoints) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const { baseURL, id } = record;
    if (typeof id !== "string" || id.length === 0) {
      continue;
    }
    if (typeof baseURL !== "string" || !isValidUrl(baseURL)) {
      continue;
    }

    const endpoint: EndpointConfig = { baseURL, id };
    if (typeof record.name === "string") {
      endpoint.name = record.name;
    }
    if (typeof record.apiKey === "string") {
      endpoint.apiKey = record.apiKey;
    }
    if (record.headers && typeof record.headers === "object") {
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(record.headers)) {
        if (typeof value === "string") {
          headers[key] = value;
        }
      }
      if (Object.keys(headers).length > 0) {
        endpoint.headers = headers;
      }
    }
    if (isStringArray(record.include)) {
      endpoint.include = record.include;
    }
    if (isStringArray(record.exclude)) {
      endpoint.exclude = record.exclude;
    }
    endpoints.push(endpoint);
  }
  return endpoints;
};
const isCompatibleProviderPackage = (pkg: unknown): boolean =>
  typeof pkg === "string" &&
  (pkg === PROVIDER_PACKAGE ||
    pkg === "@ai-sdk/openai-compatible" ||
    pkg.includes("openai-compatible"));

const extractHeaders = (
  provider: NonNullable<CatalogProviderItem["provider"]>
): Record<string, string> | undefined => {
  const settings = provider.settings ?? provider.options;
  const rawHeaders =
    provider.headers ??
    (typeof settings?.headers === "object" && settings.headers !== null
      ? (settings.headers as Record<string, unknown>)
      : undefined);

  if (!rawHeaders || typeof rawHeaders !== "object") {
    return undefined;
  }

  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawHeaders)) {
    if (typeof v === "string") {
      headers[k] = v;
    }
  }
  return Object.keys(headers).length > 0 ? headers : undefined;
};

const isLocalOrConfiguredEndpoint = (
  baseURL: string,
  provider: NonNullable<CatalogProviderItem["provider"]>,
  id: string
): boolean => {
  try {
    const parsed = new URL(baseURL);
    const host = parsed.hostname.toLowerCase();
    const isLocalHost =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.endsWith(".local") ||
      !host.includes(".") ||
      host.startsWith("192.168.") ||
      host.startsWith("10.") ||
      (host.startsWith("172.") && parsed.port.length > 0);

    const settings = provider.settings ?? provider.options;
    const hasAuthOrHeaders = Boolean(
      settings?.apiKey ||
      provider.headers ||
      settings?.headers ||
      apiKeyFromEnvironment(id)
    );

    const isExplicitPackage =
      provider.package === PROVIDER_PACKAGE ||
      provider.npm === "@ai-sdk/openai-compatible" ||
      provider.package === "@ai-sdk/openai-compatible";

    return isLocalHost || (isExplicitPackage && hasAuthOrHeaders);
  } catch {
    return false;
  }
};

const extractSingleCatalogEndpoint = (
  provider: NonNullable<CatalogProviderItem["provider"]>
): EndpointConfig | null => {
  const id =
    typeof provider.id === "string" ? provider.id : String(provider.id ?? "");
  if (id.length === 0 || id === "[object Object]") {
    return null;
  }

  const pkg = provider.package ?? provider.npm;
  if (pkg && !isCompatibleProviderPackage(pkg)) {
    return null;
  }

  const settings = provider.settings ?? provider.options;
  const baseURL =
    typeof settings?.baseURL === "string" ? settings.baseURL : undefined;
  if (!baseURL || !isValidUrl(baseURL)) {
    return null;
  }

  if (!isLocalOrConfiguredEndpoint(baseURL, provider, id)) {
    return null;
  }

  const apiKey =
    (typeof settings?.apiKey === "string" ? settings.apiKey : undefined) ??
    apiKeyFromEnvironment(id);

  return {
    apiKey,
    baseURL,
    headers: extractHeaders(provider),
    id,
    name: provider.name,
  };
};
const extractCatalogEndpoints = (
  items: readonly CatalogProviderItem[]
): EndpointConfig[] => {
  const endpoints: EndpointConfig[] = [];
  for (const { provider } of items) {
    if (!provider) {
      continue;
    }
    const endpoint = extractSingleCatalogEndpoint(provider);
    if (endpoint) {
      endpoints.push(endpoint);
    }
  }
  return endpoints;
};
const stripJsonComments = (content: string): string => {
  let insideString = false;
  let isEscaped = false;
  let result = "";
  let i = 0;
  while (i < content.length) {
    const char = content[i];
    const next = content[i + 1];
    if (char === '"' && !isEscaped) {
      insideString = !insideString;
      result += char;
      i += 1;
      continue;
    }
    if (char === "\\" && insideString) {
      isEscaped = !isEscaped;
      result += char;
      i += 1;
      continue;
    }
    isEscaped = false;
    if (!insideString && char === "/" && next === "/") {
      while (i < content.length && content[i] !== "\n") {
        i += 1;
      }
      result += "\n";
      i += 1;
      continue;
    }
    result += char;
    i += 1;
  }
  return result;
};

const parseConfigFileEndpoints = (
  targetDirs: readonly string[]
): EndpointConfig[] => {
  for (const dir of targetDirs) {
    const candidates = [
      path.join(dir, "opencode.json"),
      path.join(dir, "opencode.jsonc"),
    ];
    for (const filePath of candidates) {
      if (!existsSync(filePath)) {
        continue;
      }
      try {
        const content = readFileSync(filePath, "utf-8");
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(content) as Record<string, unknown>;
        } catch {
          const clean = stripJsonComments(content);
          parsed = JSON.parse(clean) as Record<string, unknown>;
        }
        const providerConfig = parsed.provider ?? parsed.providers;
        if (!providerConfig || typeof providerConfig !== "object") {
          continue;
        }
        const items: CatalogProviderItem[] = [];
        for (const [id, value] of Object.entries(
          providerConfig as Record<string, unknown>
        )) {
          if (!value || typeof value !== "object") {
            continue;
          }
          const entry = value as Record<string, unknown>;
          items.push({
            provider: {
              headers: (entry.headers as Record<string, string>) ?? undefined,
              id,
              name: typeof entry.name === "string" ? entry.name : id,
              npm: typeof entry.npm === "string" ? entry.npm : undefined,
              options: (entry.options as Record<string, unknown>) ?? undefined,
              package:
                typeof entry.package === "string" ? entry.package : undefined,
              settings:
                (entry.settings as Record<string, unknown>) ?? undefined,
            },
          });
        }
        const results = extractCatalogEndpoints(items);
        if (results.length > 0) {
          return results;
        }
      } catch (error) {
        console.error(
          "[AUTODISCOVER] parseConfigFileEndpoints error for",
          filePath,
          error
        );
      }
    }
  }
  return [];
};
const buildLimit = (
  model: DiscoveredModel,
  openrouter: OpenRouterModel | null
): { context: number; output: number } => {
  if (model.contextWindow || model.maxOutput) {
    return {
      context: model.contextWindow || 32_768,
      output: model.maxOutput || 4096,
    };
  }
  if (openrouter) {
    return {
      context: openrouter.context_length,
      output: openrouter.top_provider.max_completion_tokens || 4096,
    };
  }
  return { context: 32_768, output: 4096 };
};

const buildCost = (
  cost: NonNullable<ModelsDevModel["cost"]>
): Model.Info["cost"][number] => {
  const value = {
    cache: { read: cost.cache_read ?? 0, write: 0 },
    input: cost.input,
    output: cost.output,
  };
  // Models.dev cost is unbranded; the catalog cost schema brands money fields.
  return value as Model.Info["cost"][number];
};

export default Plugin.define({
  id: "opencode.autodiscover",
  setup: async (ctx) => {
    const ctxWithLocation = ctx as { location?: { directory?: string } };
    const configDir = ctxWithLocation.location?.directory ?? process.cwd();
    const fileEndpoints = parseConfigFileEndpoints([configDir]);
    const explicitEndpoints = [
      ...fileEndpoints,
      ...parseEndpoints(ctx.options).map((endpoint) => ({
        ...endpoint,
        apiKey: endpoint.apiKey ?? apiKeyFromEnvironment(endpoint.id),
      })),
    ];

    let endpoints: EndpointConfig[] = [...explicitEndpoints];
    const syncEndpointsFromCatalog = (
      items: readonly CatalogProviderItem[]
    ): void => {
      const catalogEndpoints = extractCatalogEndpoints(items);
      const endpointMap = new Map<string, EndpointConfig>();
      for (const ep of catalogEndpoints) {
        endpointMap.set(ep.id, ep);
      }
      for (const ep of explicitEndpoints) {
        endpointMap.set(ep.id, ep);
      }
      endpoints = [...endpointMap.values()];
    };

    const catalogDomain = ctx.catalog as {
      provider?: { list?: () => unknown };
    };
    if (typeof catalogDomain.provider?.list === "function") {
      const catalogProviders = await Promise.resolve(
        catalogDomain.provider.list()
      );
      // Startup sync
      if (Array.isArray(catalogProviders)) {
        syncEndpointsFromCatalog(
          catalogProviders as readonly CatalogProviderItem[]
        );
      }
    }
    const managed = new Map<string, Set<string>>();
    let results: EndpointResult[] = [];
    let isRefreshing = false;

    const fetchAllModels = async (): Promise<void> => {
      if (endpoints.length === 0) {
        return;
      }
      results = await Promise.all(
        endpoints.map(async (endpoint): Promise<EndpointResult> => {
          const discoveredModels = await fetchModels(
            endpoint.baseURL,
            endpoint.apiKey,
            endpoint.headers
          );
          const filtered = discoveredModels.filter((model) =>
            matchesFilter(
              model.id,
              endpoint.include ?? [],
              endpoint.exclude ?? []
            )
          );
          const models = await Promise.all(
            filtered.map(async (model): Promise<EnrichedModel> => {
              const [openrouter, modelsdev] = await Promise.all([
                lookupOpenRouterMetadata(model.id),
                lookupModelsDevMetadata(model.id),
              ]);
              return { model, modelsdev, openrouter };
            })
          );
          return { endpoint, models };
        })
      );
    };

    const refresh = async (): Promise<void> => {
      if (isRefreshing) {
        return;
      }
      isRefreshing = true;
      try {
        await fetchAllModels();
        if (results.length > 0) {
          await ctx.catalog.reload();
        }
      } finally {
        isRefreshing = false;
      }
    };

    await fetchAllModels();

    if (endpoints.length === 0) {
      return;
    }

    await ctx.catalog.transform((catalog) => {
      if (typeof catalog.provider.list === "function") {
        syncEndpointsFromCatalog(
          catalog.provider.list() as readonly CatalogProviderItem[]
        );
      }

      for (const { endpoint, models } of results) {
        catalog.provider.update(endpoint.id, (provider) => {
          provider.name = endpoint.name || provider.name;
          provider.package = PROVIDER_PACKAGE;
          provider.settings = {
            ...provider.settings,
            baseURL: endpoint.baseURL,
            ...(endpoint.apiKey ? { apiKey: endpoint.apiKey } : {}),
          };
          if (endpoint.headers) {
            provider.headers = {
              ...provider.headers,
              ...endpoint.headers,
            };
          }
        });

        const managedForProvider =
          managed.get(endpoint.id) ?? new Set<string>();
        for (const enriched of models) {
          if (
            catalog.model.get(endpoint.id, enriched.model.id) &&
            !managedForProvider.has(enriched.model.id)
          ) {
            continue;
          }

          catalog.model.update(endpoint.id, enriched.model.id, (draft) => {
            draft.capabilities = {
              input: [],
              output: [],
              tools: Boolean(enriched.model.tool_call),
            };
            draft.enabled = true;
            draft.limit = buildLimit(
              enriched.model,
              enriched.openrouter
            ) as Model.Info["limit"];
            draft.name = enriched.model.name;
            if (enriched.modelsdev?.cost) {
              draft.cost = [buildCost(enriched.modelsdev.cost)];
            }
          });

          managedForProvider.add(enriched.model.id);
        }
        managed.set(endpoint.id, managedForProvider);
      }
    });
    await ctx.tool.transform((tools) => {
      tools.add({
        description: "Refresh models from local OpenAI-compatible endpoints",
        execute: async () => {
          clearOpenRouterCache();
          clearModelsDevCache();
          await refresh();
          return { content: "Models refreshed from local endpoints." };
        },
        input: {
          additionalProperties: false,
          properties: {},
          type: "object",
        },
        name: "refresh-local-models",
      });
    });
  },
});
