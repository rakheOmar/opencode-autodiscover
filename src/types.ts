export interface LocalProviderConfig {
  name?: string;
  baseURL: string;
  apiKey?: string;
  modelOverrides?: Record<string, ModelOverride>;
}

export interface ModelOverride {
  contextWindow?: number;
  maxOutput?: number;
  tool_call?: boolean;
  reasoning?: boolean;
  temperature?: boolean;
}

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

export interface OpenRouterResponse {
  data: OpenRouterModel[];
}

export interface OpenAIModelResponse {
  data: {
    id: string;
    object: string;
    created: number;
    owned_by?: string;
  }[];
}

export interface CacheEntry {
  timestamp: number;
  models: OpenRouterModel[];
}
