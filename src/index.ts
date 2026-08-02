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

const PROVIDER_PACKAGE = "@ai-sdk/openai-compatible";

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
    const endpoints = parseEndpoints(ctx.options).map((endpoint) => ({
      ...endpoint,
      apiKey: endpoint.apiKey ?? apiKeyFromEnvironment(endpoint.id),
    }));
    if (endpoints.length === 0) {
      return;
    }

    // Model IDs managed by this plugin per provider; user-defined models win.
    const managed = new Map<string, Set<string>>();
    let results: EndpointResult[] = [];

    await ctx.catalog.transform((catalog) => {
      for (const { endpoint, models } of results) {
        catalog.provider.update(endpoint.id, (provider) => {
          provider.name = endpoint.name || provider.name;
          provider.package = PROVIDER_PACKAGE;
          provider.settings = {
            ...provider.settings,
            baseURL: endpoint.baseURL,
            ...(endpoint.apiKey ? { apiKey: endpoint.apiKey } : {}),
            ...(endpoint.headers ? { headers: endpoint.headers } : {}),
          };
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

    const refresh = async (): Promise<void> => {
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
      await ctx.catalog.reload();
    };

    await refresh();

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
