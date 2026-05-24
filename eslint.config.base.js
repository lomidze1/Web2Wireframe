import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Shared ESLint base config for the Web2Wireframe monorepo.
 *
 * Strictness ratchet strategy: most "code quality" rules are `warn` (visible
 * but non-blocking) so existing tech debt does not break CI. Only true
 * correctness/security rules are `error`. As the codebase improves we can
 * gradually flip warnings to errors.
 */
export const baseConfig = [
  {
    ignores: [
      "dist/**",
      "build/**",
      ".turbo/**",
      "node_modules/**",
      "coverage/**",
      "*.config.js",
      "*.config.ts",
      "*.config.mjs",
      "**/*.d.ts",
      "scripts/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-empty-object-type": "warn",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "prefer-const": "warn",
      "no-var": "error",
      "no-debugger": "error",
      // Regex escapes are often intentional for readability — demote to warn.
      "no-useless-escape": "warn",
      // Allow tiny untyped require-style escape hatches in TS via comments
      "@typescript-eslint/ban-ts-comment": [
        "warn",
        { "ts-expect-error": "allow-with-description" },
      ],
      // Express/global type augmentation requires the namespace pattern.
      // The official TS handbook itself uses `declare global { namespace ... }`
      // for ambient-module augmentation, so this rule is wrong for us.
      "@typescript-eslint/no-namespace": "off",
      // Optional-chain side effect like `obj?.fn()` is a valid expression
      // statement; eslint flags it. Allow short-circuits and ternaries.
      "@typescript-eslint/no-unused-expressions": [
        "error",
        { allowShortCircuit: true, allowTernary: true, allowTaggedTemplates: true },
      ],
      // Truthiness analysis can mis-fire on optional config values that
      // are statically wider than the literal currently in source.
      "no-constant-binary-expression": "warn",
    },
  },
];
