import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import vitest from "ultracite/oxlint/vitest";

export default defineConfig({
  extends: [core, vitest],
  overrides: [
    {
      files: ["tests/**/*.ts"],
      rules: {
        // Mock transform APIs must receive and invoke callbacks to emulate the
        // SDK registration semantics; the rule targets application error
        // handling, not test doubles.
        "promise/prefer-await-to-callbacks": "off",
      },
    },
  ],
});
