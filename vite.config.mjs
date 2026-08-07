import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/module.mjs",
      formats: ["es"],
      fileName: () => "module.mjs",
    },
    outDir: "dist",
    sourcemap: true,
    minify: false,
    rollupOptions: {
      output: { assetFileNames: "styles/module[extname]" },
    },
  },
});
