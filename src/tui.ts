import { Plugin } from "@opencode-ai/plugin/tui";

const refreshLocalModels = async (context: Plugin.Context): Promise<void> => {
  context.ui.toast.show({
    duration: 2000,
    message: "Refreshing local endpoints...",
    title: "Autodiscover",
    variant: "info",
  });

  try {
    const location = context.location ?? context.data.location.default();
    await Promise.all([
      context.data.location.model.sync(location),
      context.data.location.provider.sync(location),
    ]);
    context.data.location.model.invalidate(location);
    context.data.location.provider.invalidate(location);

    context.ui.toast.show({
      duration: 3000,
      message: "Local models refreshed successfully.",
      title: "Autodiscover",
      variant: "success",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to refresh local models.";
    context.ui.toast.show({
      duration: 5000,
      message,
      title: "Autodiscover Error",
      variant: "error",
    });
  }
};

export default Plugin.define({
  id: "opencode.autodiscover.cli",
  setup: (context): Plugin.Cleanup => {
    let unregisterSlot: (() => void) | undefined;
    try {
      if (typeof context.ui?.slot === "function") {
        unregisterSlot = context.ui.slot("app", () => {
          try {
            context.keymap.layer(() => ({
              bindings: ["autodiscover.refresh"],
              commands: [
                {
                  group: "Models",
                  id: "autodiscover.refresh",
                  palette: true,
                  run: async () => {
                    await refreshLocalModels(context);
                  },
                  slash: {
                    aliases: ["models:refresh", "autodiscover:refresh"],
                    name: "refresh-models",
                  },
                  suggested: true,
                  title: "Refresh Local Models",
                },
              ],
              mode: "global",
            }));
          } catch {
            // Gracefully ignore if Keymap.Provider is not mounted in the current render pass
          }
          return null;
        });
      }
    } catch {
      // Gracefully handle environments without slot support
    }

    return () => {
      unregisterSlot?.();
    };
  },
});
