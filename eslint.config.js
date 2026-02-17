import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["node_modules/**", "docs/**"],
  },
  js.configs.recommended,
  {
    files: ["src/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    files: ["tests/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
        describe: "readonly",
        it: "readonly",
        test: "readonly",
        expect: "readonly",
        beforeAll: "readonly",
        beforeEach: "readonly",
        afterAll: "readonly",
        afterEach: "readonly",
      },
    },
  },
  {
    files: ["playwright.config.js", "vitest.config.js"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];
