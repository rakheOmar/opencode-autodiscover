import { providers } from "models-dev-db";

import type { ModelsDevModel } from "./types.js";

let modelCache: Record<string, ModelsDevModel> | null = null;

const buildLookupMap = async (): Promise<Record<string, ModelsDevModel>> => {
  if (modelCache) {
    return modelCache;
  }

  const allProviders = await providers();
  const map: Record<string, ModelsDevModel> = {};

  for (const provider of allProviders) {
    for (const [modelId, modelData] of Object.entries(provider.models)) {
      const fullId = `${provider.id}/${modelId}`;
      const data = modelData as unknown as ModelsDevModel;
      map[fullId] = data;
      if (!map[modelId] || (data.cost?.input && !map[modelId].cost?.input)) {
        map[modelId] = data;
      }
    }
  }

  modelCache = map;
  return map;
};

export const lookupModelMetadata = async (
  modelId: string
): Promise<ModelsDevModel | null> => {
  const map = await buildLookupMap();
  return map[modelId] || null;
};

export const clearCache = (): void => {
  modelCache = null;
};

export const ensureCache = (): Promise<Record<string, ModelsDevModel>> =>
  buildLookupMap();
