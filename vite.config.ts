import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  root: ".",
  server: {
    port: 3000,
    open: false,
    headers: {
      // 开启跨域隔离以支持 SharedArrayBuffer 与 WebGPU 高性能特性
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  resolve: {
    alias: {
      "@data": path.resolve(__dirname, "data"),
      "@logits": path.resolve(__dirname, "data/logits"),
      "@shaders": path.resolve(__dirname, "data/shaders"),
      "@entity": path.resolve(__dirname, "data/entity"),
    },
  },
  assetsInclude: ["**/*.wgsl"],
});
