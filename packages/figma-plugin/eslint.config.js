import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import { baseConfig } from "../../eslint.config.base.js";

export default [
  ...baseConfig,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // Preact JSX pragma — `h` and `Fragment` are referenced by the
      // /** @jsx h */ comments, not directly by code, so eslint sees them
      // as unused. They're required. Also allow any `_`-prefixed binding
      // (e.g. `_omit`) — convention for "deliberately discarded".
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^(_|h$|Fragment$)",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    // src/main.ts is the Figma sandbox entry — runs in Figma's plugin runtime.
    files: ["src/main.ts", "src/figma/**/*.ts"],
    languageOptions: {
      globals: { figma: "readonly", __html__: "readonly" },
    },
  },
  {
    files: ["src/__tests__/**/*.{ts,tsx}", "**/*.test.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off",
    },
  },
];
