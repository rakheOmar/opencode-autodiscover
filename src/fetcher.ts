import { isValidUrl, sanitizeModelId } from "./security.js";
import type { DiscoveredModel } from "./types.js";

interface ModelResponse {
  id: string;
  name?: string;
  object: string;
  created: number;
  owned_by?: string;
  context_length?: number;
  max_completion_tokens?: number;
  max_output_tokens?: number;
  capabilities?: {
    tool_choice?: boolean;
    function_calling?: boolean;
    reasoning?: boolean;
    vision?: boolean;
    temperature?: boolean;
    structured_output?: boolean;
  };
  supported_parameters?: string[];
}

interface ModelsResponse {
  data: ModelResponse[];
}

export const fetchModels = async (
  baseURL: string,
  apiKey?: string
): Promise<DiscoveredModel[]> => {
  if (!isValidUrl(baseURL)) {
    return [];
  }

  try {
    const url = `${baseURL.replace(/\/$/, "")}/models`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      return [];
    }

    const data: ModelsResponse = await response.json();

    if (!data.data || !Array.isArray(data.data)) {
      return [];
    }

    return data.data.map((model) => {
      const discovered: DiscoveredModel = {
        id: sanitizeModelId(model.id),
        name: model.name || model.id,
      };

      if (model.context_length) {
        discovered.contextWindow = model.context_length;
      }

      if (model.max_completion_tokens || model.max_output_tokens) {
        discovered.maxOutput =
          model.max_completion_tokens || model.max_output_tokens;
      }

      if (model.capabilities) {
        if (
          model.capabilities.function_calling ||
          model.capabilities.tool_choice
        ) {
          discovered.tool_call = true;
        }
        if (model.capabilities.reasoning) {
          discovered.reasoning = true;
        }
        if (model.capabilities.temperature) {
          discovered.temperature = true;
        }
      }

      if (model.supported_parameters) {
        if (
          model.supported_parameters.includes("tools") ||
          model.supported_parameters.includes("tool_choice")
        ) {
          discovered.tool_call = true;
        }
        if (model.supported_parameters.includes("temperature")) {
          discovered.temperature = true;
        }
      }

      return discovered;
    });
  } catch {
    return [];
  }
};
