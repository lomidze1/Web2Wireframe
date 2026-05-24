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
      globals: { ...globals.browser, chrome: "readonly" },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^(_|h|Fragment)$",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["src/background/**/*.ts", "src/content/**/*.ts"],
    languageOptions: {
      // Service worker + content script — full chrome.* APIs
      globals: { ...globals.browser, chrome: "readonly" },
    },
  },
];
