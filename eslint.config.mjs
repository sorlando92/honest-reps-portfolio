import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import copyRules from "./eslint-rules/copy-rules.mjs";

const SOURCE = ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "core/**/*.{ts,tsx}", "modules/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"];
// Legal documents may use protected titles where the law requires the word
// (CLAUDE.md rule 7). Locked AI prompts name them in order to forbid them.
const TITLE_EXEMPT = ["app/(legal)/**", "lib/ai/**"];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: SOURCE,
    ignores: ["**/*.test.{ts,tsx}"],
    plugins: { "honest-reps": copyRules },
    rules: { "honest-reps/copy-rules": "error" },
  },
  {
    files: TITLE_EXEMPT,
    rules: { "honest-reps/copy-rules": ["error", { allowProtectedTitles: true }] },
  },
  {
    // Module boundaries (ARCHITECTURE.md): core never imports from a module.
    files: ["core/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["@/modules/*", "**/modules/*"], message: "Core must not import from modules. Use the registry in core/modules.ts." }] },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
    "supabase/**",
    // Generated or local-only folders.
    "evals/.cache/**",
    "evals/results/**",
    "public/vendor/**",
    ".chain-sources/**",
  ]),
]);

export default eslintConfig;
