import type { Plugin } from "@opencode-ai/plugin/tui";
import { beforeEach, describe, expect, it, vi } from "vitest";

import tuiPlugin from "../src/tui.js";

type TuiContext = Plugin.Context;
type ToastOptions = Parameters<TuiContext["ui"]["toast"]["show"]>[0];
type KeymapLayer = Parameters<
  TuiContext["keymap"]["layer"]
>[0] extends () => infer L
  ? L
  : never;
type KeymapCommand = NonNullable<KeymapLayer["commands"]>[number];

interface MockContextOptions {
  location?: { directory: string };
  syncError?: Error;
}

const createMockLocationCollection = () => ({
  invalidate: vi.fn<() => void>(),
  list: vi.fn<() => []>(() => []),
  sync: vi.fn<() => Promise<void>>(() => Promise.resolve()),
});

const createMockTuiContext = (options: MockContextOptions = {}) => {
  const registeredLayers: (() => KeymapLayer)[] = [];
  const toasts: ToastOptions[] = [];
  const modelSyncCalls: unknown[] = [];
  const modelInvalidateCalls: unknown[] = [];
  const providerSyncCalls: unknown[] = [];
  const providerInvalidateCalls: unknown[] = [];

  const defaultLocation = { directory: "/default/project" };

  const mockModel = {
    invalidate: vi.fn<(loc?: unknown) => void>((loc) => {
      modelInvalidateCalls.push(loc);
    }),
    list: vi.fn<() => []>(() => []),
    sync: vi.fn<(loc?: unknown) => Promise<void>>((loc) => {
      if (options.syncError) {
        return Promise.reject(options.syncError);
      }
      modelSyncCalls.push(loc);
      return Promise.resolve();
    }),
  };

  const mockProvider = {
    invalidate: vi.fn<(loc?: unknown) => void>((loc) => {
      providerInvalidateCalls.push(loc);
    }),
    list: vi.fn<() => []>(() => []),
    sync: vi.fn<(loc?: unknown) => Promise<void>>((loc) => {
      providerSyncCalls.push(loc);
      return Promise.resolve();
    }),
  };

  const mockKeymap = {
    active: vi.fn<() => []>(() => []),
    commands: vi.fn<() => []>(() => []),
    dispatch: vi.fn<(id: string, input?: string) => void>(),
    layer: vi.fn<(input: () => KeymapLayer) => void>((input) => {
      registeredLayers.push(input);
    }),
    mode: {
      current: vi.fn<() => string>(() => "base"),
      push: vi.fn<(mode: string) => () => void>(() => vi.fn<() => void>()),
    },
    pending: vi.fn<() => []>(() => []),
    shortcuts: vi.fn<(id: string) => readonly string[]>(() => []),
  };

  const mockToast = {
    show: vi.fn<(toast: ToastOptions) => void>((toast) => {
      toasts.push(toast);
    }),
  };

  const context = {
    app: {
      channel: "stable" as const,
      version: "2.0.0",
    },
    attention: {
      notify: vi.fn<() => Promise<unknown>>(() => Promise.resolve({})),
    },
    client: {} as unknown as TuiContext["client"],
    data: {
      listen: vi.fn<() => () => void>(() => vi.fn<() => void>()),
      location: {
        agent: createMockLocationCollection(),
        command: createMockLocationCollection(),
        default: vi.fn<() => typeof defaultLocation>(() => defaultLocation),
        integration: createMockLocationCollection(),
        invalidate: vi.fn<() => void>(),
        mcp: {
          resource: createMockLocationCollection(),
          server: createMockLocationCollection(),
        },
        model: mockModel,
        provider: mockProvider,
        reference: createMockLocationCollection(),
        skill: createMockLocationCollection(),
        sync: vi.fn<() => Promise<void>>(() => Promise.resolve()),
      },
      on: vi.fn<() => () => void>(() => vi.fn<() => void>()),
      project: {} as unknown as TuiContext["data"]["project"],
      session: {} as unknown as TuiContext["data"]["session"],
      shell: {} as unknown as TuiContext["data"]["shell"],
    },
    keymap: mockKeymap,
    location: options.location,
    options: {},
    renderer: {} as unknown as TuiContext["renderer"],
    storage: {} as unknown as TuiContext["storage"],
    theme: {} as unknown as TuiContext["theme"],
    ui: {
      dialog: {} as unknown as TuiContext["ui"]["dialog"],
      format: { path: (p: string) => p },
      router: {} as unknown as TuiContext["ui"]["router"],
      slot: vi.fn<() => () => void>(() => vi.fn<() => void>()),
      tabs: {} as unknown as TuiContext["ui"]["tabs"],
      toast: mockToast,
    },
  } as unknown as TuiContext;

  return {
    context,
    getLayers: () => registeredLayers.map((fn) => fn()),
    modelInvalidateCalls,
    modelSyncCalls,
    providerInvalidateCalls,
    providerSyncCalls,
    toasts,
  };
};

describe("autodiscover CLI plugin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("defines the CLI plugin with expected identifier", () => {
    expect(tuiPlugin.id).toBe("opencode.autodiscover.cli");
    expect(tuiPlugin.setup).toBeTypeOf("function");
  });

  it("registers a keymap layer with global mode and bindings", () => {
    const { context, getLayers } = createMockTuiContext();
    tuiPlugin.setup(context);

    const layers = getLayers();
    expect(layers).toHaveLength(1);

    const [layer] = layers;
    expect(layer.mode).toBe("global");
    expect(layer.bindings).toContain("autodiscover.refresh");
  });

  it("configures the refresh command with title, palette, and slash aliases", () => {
    const { context, getLayers } = createMockTuiContext();
    tuiPlugin.setup(context);

    const command = getLayers()[0].commands?.find(
      (c: KeymapCommand) => c.id === "autodiscover.refresh"
    );
    expect(command?.title).toBe("Refresh Local Models");
    expect(command?.group).toBe("Models");
    expect(command?.palette).toBeTruthy();
    expect(command?.suggested).toBeTruthy();
    expect(command?.slash?.aliases).toStrictEqual([
      "models:refresh",
      "autodiscover:refresh",
    ]);
  });

  it("shows toasts when refresh command succeeds", async () => {
    const customLocation = { directory: "/workspace/app" };
    const { context, getLayers, toasts } = createMockTuiContext({
      location: customLocation,
    });
    tuiPlugin.setup(context);

    const command = getLayers()[0].commands?.find(
      (c: KeymapCommand) => c.id === "autodiscover.refresh"
    );
    await command?.run();

    expect(toasts).toHaveLength(2);
    expect(toasts[0]).toStrictEqual({
      duration: 2000,
      message: "Refreshing local endpoints...",
      title: "Autodiscover",
      variant: "info",
    });
    expect(toasts[1]).toStrictEqual({
      duration: 3000,
      message: "Local models refreshed successfully.",
      title: "Autodiscover",
      variant: "success",
    });
  });

  it("synchronizes and invalidates models and providers for custom location", async () => {
    const customLocation = { directory: "/workspace/app" };
    const {
      context,
      getLayers,
      modelInvalidateCalls,
      modelSyncCalls,
      providerInvalidateCalls,
      providerSyncCalls,
    } = createMockTuiContext({ location: customLocation });
    tuiPlugin.setup(context);

    const command = getLayers()[0].commands?.find(
      (c: KeymapCommand) => c.id === "autodiscover.refresh"
    );
    await command?.run();

    expect(modelSyncCalls).toStrictEqual([customLocation]);
    expect(modelInvalidateCalls).toStrictEqual([customLocation]);
    expect(providerSyncCalls).toStrictEqual([customLocation]);
    expect(providerInvalidateCalls).toStrictEqual([customLocation]);
  });

  it("falls back to default location when context.location is undefined", async () => {
    const {
      context,
      getLayers,
      modelInvalidateCalls,
      modelSyncCalls,
      providerInvalidateCalls,
      providerSyncCalls,
    } = createMockTuiContext({ location: undefined });
    tuiPlugin.setup(context);

    const command = getLayers()[0].commands?.find(
      (c: KeymapCommand) => c.id === "autodiscover.refresh"
    );
    await command?.run();

    const expectedDefault = { directory: "/default/project" };
    expect(modelSyncCalls).toStrictEqual([expectedDefault]);
    expect(modelInvalidateCalls).toStrictEqual([expectedDefault]);
    expect(providerSyncCalls).toStrictEqual([expectedDefault]);
    expect(providerInvalidateCalls).toStrictEqual([expectedDefault]);
  });

  it("shows an error toast when model sync fails", async () => {
    const syncError = new Error("Connection refused: http://localhost:11434");
    const { context, getLayers, toasts } = createMockTuiContext({ syncError });
    tuiPlugin.setup(context);

    const command = getLayers()[0].commands?.find(
      (c: KeymapCommand) => c.id === "autodiscover.refresh"
    );
    await command?.run();

    expect(toasts).toHaveLength(2);
    expect(toasts[0].variant).toBe("info");
    expect(toasts[1]).toStrictEqual({
      duration: 5000,
      message: "Connection refused: http://localhost:11434",
      title: "Autodiscover Error",
      variant: "error",
    });
  });

  it("handles non-Error thrown values gracefully", async () => {
    const { context, getLayers, toasts } = createMockTuiContext();
    const mockSync = vi.fn<() => Promise<void>>(() =>
      Promise.reject(new Error("Generic failure"))
    );
    context.data.location.model.sync = mockSync;
    tuiPlugin.setup(context);

    const command = getLayers()[0].commands?.find(
      (c: KeymapCommand) => c.id === "autodiscover.refresh"
    );
    await command?.run();

    expect(toasts).toHaveLength(2);
    expect(toasts[1]).toStrictEqual({
      duration: 5000,
      message: "Generic failure",
      title: "Autodiscover Error",
      variant: "error",
    });
  });

  it("returns a cleanup function that executes without error", () => {
    const { context } = createMockTuiContext();
    const cleanup = tuiPlugin.setup(context);
    expect(cleanup).toBeTypeOf("function");
    expect(() => {
      if (typeof cleanup === "function") {
        cleanup();
      }
    }).not.toThrow();
  });
});
