export interface DiscoveredModel {
  id: string;
  name: string;
  contextWindow?: number;
  maxOutput?: number;
  tool_call?: boolean;
  reasoning?: boolean;
  temperature?: boolean;
  cost?: {
    input: number;
    output: number;
  };
}

export interface OpenRouterModel {
  id: string;
  name: string;
  context_length: number;
  top_provider: {
    max_completion_tokens: number | null;
  };
  supported_parameters: string[];
}

export interface CacheEntry {
  timestamp: number;
  models: OpenRouterModel[];
}

export interface ModelsDevModel {
  limit: { context: number; output: number };
  cost?: { input: number; output: number; cache_read?: number };
  reasoning?: boolean;
  tool_call?: boolean;
  temperature?: boolean;
}
