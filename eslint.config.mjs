// @ts-check
// Root ESLint configuration for the TypeScript packages and the agent. The first-attempt web app
// (apps/web) keeps its own `next lint` setup until it is rebuilt in milestone M2.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/.next/**", "**/out/**", "**/coverage/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      // English-only identifiers (AGENTS.md guardrail 8): identifiers must be ASCII.
      "id-match": [
        "error",
        "^[A-Za-z_$][A-Za-z0-9_$]*$",
        { properties: true, classFields: true, onlyDeclarations: false, ignoreDestructuring: false },
      ],
      "no-irregular-whitespace": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error",
    },
  },
);
