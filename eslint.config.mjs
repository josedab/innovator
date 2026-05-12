import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import prettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  // Exclude build artifacts, generated output, and the Docusaurus website
  globalIgnores([
    "**/node_modules/**",
    "**/dist/**",
    "**/.next/**",
    "**/build/**",
    "**/out/**",
    "website/**",
    "coverage/**",
  ]),
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
      "@typescript-eslint": tseslint,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      // Allow unused vars when prefixed with _ (common pattern for intentionally unused params)
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // Disables rules that conflict with Prettier formatting
  prettier,
]);

export default eslintConfig;
