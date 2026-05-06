import type { Plugin } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";

import { fetchModels } from "./fetcher.js";
import { lookupModelMetadata, clearCache, getAllModels } from "./openrouter.js";
import { sanitizeErrorMessage } from "./security.js";

interface ProviderConfig {
  name?: string;
  options?: {
    baseURL?: string;
    apiKey?: string;
    [key: string]: unknown;
  };
  models?: Record<string, unknown>;
  [key: string]: unknown;
}

const isLocalProvider = (provider: ProviderConfig): boolean =>
  !!provider.options?.baseURL;

const getApiKey = (
  provider: ProviderConfig,
  providerId: string
): string | undefined => {
  if (provider.options?.apiKey) {
    return provider.options.apiKey;
  }

  const envKey = `OPENCODE_LOCAL_${providerId.toUpperCase().replaceAll("-", "_")}_API_KEY`;
  return process.env[envKey];
};

const buildModelLimit = (
  model: { contextWindow?: number; maxOutput?: number },
  metadata: {
    context_length: number;
    top_provider: { max_completion_tokens: number | null };
  } | null
) => {
  if (model.contextWindow || model.maxOutput) {
    return {
      context: model.contextWindow || 32_768,
      output: model.maxOutput || 4096,
    };
  }
  if (metadata) {
    return {
      context: metadata.context_length,
      output: metadata.top_provider.max_completion_tokens || 4096,
    };
  }
  return { context: 32_768, output: 4096 };
};

const buildModelConfig = (
  model: {
    id: string;
    name: string;
    contextWindow?: number;
    maxOutput?: number;
    tool_call?: boolean;
    reasoning?: boolean;
    temperature?: boolean;
  },
  metadata: {
    name: string;
    context_length: number;
    top_provider: { max_completion_tokens: number | null };
  } | null
): Record<string, unknown> => {
  const displayName =
    model.name === model.id && metadata?.name ? metadata.name : model.name;

  const config: Record<string, unknown> = {
    limit: buildModelLimit(model, metadata),
    name: displayName,
  };

  if (model.tool_call) {
    config.tool_call = true;
  }
  if (model.reasoning) {
    config.reasoning = true;
  }
  if (model.temperature) {
    config.temperature = true;
  }

  return config;
};

export const LocalModelsPlugin: Plugin = async ({ client }) => {
  await client.app.log({
    body: {
      level: "info",
      message: "Plugin initialized",
      service: "opencode-autodiscover",
    },
  });

  return {
    config: async (config) => {
      if (!config.provider) {
        return;
      }

      for (const [providerId, providerConfig] of Object.entries(
        config.provider
      )) {
        const provider = providerConfig as ProviderConfig;

        if (!isLocalProvider(provider)) {
          continue;
        }

        const baseURL = provider.options?.baseURL;
        if (!baseURL) {
          continue;
        }

        const apiKey = getApiKey(provider, providerId);

        try {
          await client.app.log({
            body: {
              level: "info",
              message: `Discovering models from ${providerId} at ${baseURL}`,
              service: "opencode-autodiscover",
            },
          });

          const discoveredModels = await fetchModels(baseURL, apiKey);

          if (!provider.models) {
            provider.models = {};
          }

          for (const model of discoveredModels) {
            const metadata = await lookupModelMetadata(model.id);

            if (!provider.models[model.id]) {
              provider.models[model.id] = buildModelConfig(model, metadata);
            }
          }

          provider.npm = "@ai-sdk/openai-compatible";
          provider.api = baseURL;

          await client.app.log({
            body: {
              level: "info",
              message: `Discovered ${discoveredModels.length} models from ${providerId}`,
              service: "opencode-autodiscover",
            },
          });
        } catch (error) {
          await client.app.log({
            body: {
              level: "warn",
              message: `Failed to discover models from ${providerId}: ${sanitizeErrorMessage(error)}`,
              service: "opencode-autodiscover",
            },
          });
        }
      }
    },
    tool: {
      "refresh-local-models": tool({
        args: {},
        description: "Refresh models from local API endpoints",
        async execute(_args, _context) {
          clearCache();
          await getAllModels();

          return "Models refreshed. Please restart OpenCode to pick up new models.";
        },
      }),
    },
  };
};
