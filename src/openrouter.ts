import * as fs from "node:fs";
import * as https from "node:https";
import * as os from "node:os";
import path from "node:path";

import { normalizeModelId } from "./normalize.js";
import type { CacheEntry, OpenRouterModel } from "./types.js";

const REQUEST_TIMEOUT_MS = 10_000;

const CACHE_DIR = path.join(
  process.env.OPENCODE_AUTODISCOVER_CACHE_DIR || os.homedir(),
  ".cache",
  "opencode-autodiscover"
);
const CACHE_FILE = path.join(CACHE_DIR, "openrouter.json");
const CACHE_TTL = 24 * 60 * 60 * 1000;

let cachedModels: OpenRouterModel[] | null = null;
let inFlightFetch: Promise<OpenRouterModel[]> | null = null;

export const clearCache = (): void => {
  cachedModels = null;
  inFlightFetch = null;
  try {
    fs.rmSync(CACHE_FILE, { force: true });
  } catch {
    // Ignore cache deletion errors
  }
};

const fetchFromOpenRouter = (): Promise<OpenRouterModel[]> => {
  const { promise, resolve } = Promise.withResolvers<OpenRouterModel[]>();

  let resolved = false;

  const done = (models: OpenRouterModel[]): void => {
    if (!resolved) {
      resolved = true;
      resolve(models);
    }
  };

  const req = https.get(
    "https://openrouter.ai/api/v1/models",
    { headers: { "Accept-Encoding": "identity" } },
    (res) => {
      if (res.statusCode !== 200) {
        done([]);
        return;
      }

      let data = "";
      res.on("data", (chunk: string) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          done(json.data || []);
        } catch {
          done([]);
        }
      });
    }
  );

  const timeout = setTimeout(() => {
    req.destroy();
    done([]);
  }, REQUEST_TIMEOUT_MS);
  timeout.unref();

  req.on("error", () => {
    done([]);
  });

  req.end();

  return promise;
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

const executeFetch = async (): Promise<OpenRouterModel[]> => {
  try {
    const models = await fetchFromOpenRouter();
    if (models.length > 0) {
      writeCache(models);
    }
    return models;
  } catch {
    return [];
  } finally {
    inFlightFetch = null;
  }
};

const getOpenRouterModels = (): Promise<OpenRouterModel[]> => {
  const cached = readCache();
  if (cached) {
    return Promise.resolve(cached);
  }
  if (!inFlightFetch) {
    inFlightFetch = executeFetch();
  }
  return inFlightFetch;
};

export const lookupModelMetadata = async (
  modelId: string
): Promise<OpenRouterModel | null> => {
  const models = await getOpenRouterModels();
  const normalizedId = normalizeModelId(modelId);

  const match = models.find((m) => {
    const normalizedOpenRouterId = normalizeModelId(m.id);
    return normalizedOpenRouterId === normalizedId;
  });

  return match || null;
};
