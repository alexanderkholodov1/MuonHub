// @ts-check
// First-attempt web app: keeps its own `next lint` setup (ESLint 9 + eslint-config-next 15) until it
// is rebuilt in milestone M2. It does not import the root config, because both register the
// @typescript-eslint plugin; the same project rules are repeated here instead.
import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

/** @type {import("eslint").Linter.Config[]} */
export default [
  // Next.js recommended rules (they register the @typescript-eslint plugin)
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      "id-match": [
        "error",
        "^[A-Za-z_$][A-Za-z0-9_$]*$",
        {
          properties: true,
          classFields: true,
          onlyDeclarations: false,
          ignoreDestructuring: false,
        },
      ],
      "no-irregular-whitespace": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error",
    },
  },
  {
    ignores: ["node_modules/**", ".next/**", "out/**"],
  },
];
