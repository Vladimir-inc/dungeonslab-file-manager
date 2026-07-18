import js from "@eslint/js";

export default [
  { ignores: ["dist/**", "node_modules/**"] },
  js.configs.recommended,
  {
    rules: {
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        game: "readonly",
        Hooks: "readonly",
        foundry: "readonly",
        CONFIG: "readonly",
        CONST: "readonly",
        ui: "readonly",
        canvas: "readonly",
        window: "readonly",
        document: "readonly",
        console: "readonly",
        HTMLElement: "readonly",
        performance: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        Event: "readonly",
        Audio: "readonly",
        URL: "readonly",
        navigator: "readonly",
        globalThis: "readonly",
      },
    },
  },
];
