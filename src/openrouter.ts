import * as fs from "node:fs";
import * as path from "node:path";

import { normalizeModelId } from "./normalize.js";
import type { OpenRouterModel, CacheEntry } from "./types.js";

const CACHE_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || "",
  ".cache",
  "opencode-local-models"
);
const CACHE_FILE = path.join(CACHE_DIR, "models.json");
const CACHE_TTL = 24 * 60 * 60 * 1000;

let cachedModels: OpenRouterModel[] | null = null;

export const clearCache = (): void => {
  cachedModels = null;
};

const fetchFromOpenRouter = async (): Promise<OpenRouterModel[]> => {
  const response = await fetch("https://openrouter.ai/api/v1/models");

  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  return data.data || [];
};

const readCache = (): OpenRouterModel[] | null => {
  if (cachedModels) {
    return cachedModels;
  }

  try {
    if (!fs.existsSync(CACHE_FILE)) {
      return null;
    }

    const content = fs.readFileSync(CACHE_FILE, "utf-8");
    const entry: CacheEntry = JSON.parse(content);

    if (Date.now() - entry.timestamp > CACHE_TTL) {
      return null;
    }

    cachedModels = entry.models;
    return cachedModels;
  } catch {
    return null;
  }
};

const writeCache = (models: OpenRouterModel[]): void => {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { mode: 0o700, recursive: true });
    }

    const entry: CacheEntry = {
      models,
      timestamp: Date.now(),
    };

    fs.writeFileSync(CACHE_FILE, JSON.stringify(entry, null, 2), {
      mode: 0o600,
    });
    cachedModels = models;
  } catch {
    // Ignore write errors
  }
};

export const lookupModelMetadata = async (
  modelId: string
): Promise<OpenRouterModel | null> => {
  let models = readCache();

  if (!models) {
    models = await fetchFromOpenRouter();
    if (models.length > 0) {
      writeCache(models);
    }
  }

  const normalizedId = normalizeModelId(modelId);

  const match = models.find((m) => {
    const normalizedOpenRouterId = normalizeModelId(m.id);
    return normalizedOpenRouterId === normalizedId;
  });

  return match || null;
};

export const getAllModels = async (): Promise<OpenRouterModel[]> => {
  let models = readCache();

  if (!models) {
    models = await fetchFromOpenRouter();
    if (models.length > 0) {
      writeCache(models);
    }
  }

  return models;
};
