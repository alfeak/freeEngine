import { defineConfig, Plugin } from "vite";
import path from "node:path";
import fs from "node:fs";

function freeEnginePackPlugin(): Plugin {
  return {
    name: "freeengine-pack-plugin",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url === "/api/pack" && req.method === "POST") {
          let body = "";
          req.on("data", (chunk) => {
            body += chunk;
          });

          req.on("end", async () => {
            try {
              const data = JSON.parse(body || "{}");
              const projectName = (data.projectName || "My25DGame").trim();
              const distDir = path.resolve(__dirname, "dist", projectName);
              const dataSrcDir = path.resolve(__dirname, "data");
              const dataDestDir = path.join(distDir, "data");

              // 1. 确保目标目录存在
              fs.mkdirSync(distDir, { recursive: true });

              // 2. 拷贝 data/ 目录
              if (fs.existsSync(dataSrcDir)) {
                fs.cpSync(dataSrcDir, dataDestDir, { recursive: true });
              }

              // 3. 翻转 EngineLock: 生产发版锁定 debug=false, packing=false
              const targetLockPath = path.join(dataDestDir, "profiles", "engine.lock.json");
              fs.mkdirSync(path.dirname(targetLockPath), { recursive: true });
              fs.writeFileSync(
                targetLockPath,
                JSON.stringify(
                  {
                    debug: false,
                    packing: false,
                    description: `freeEngine Standalone Game Release [${projectName}] (debug=off, packing=off)`,
                    releasedAt: new Date().toISOString(),
                  },
                  null,
                  2
                ),
                "utf-8"
              );

              // 4. 生成外层可执行启动入口 freeengine.exe 与启动脚本
              const rootExe = path.resolve(__dirname, "freeengine.exe");
              const destExe = path.join(distDir, "freeengine.exe");
              if (fs.existsSync(rootExe)) {
                fs.copyFileSync(rootExe, destExe);
              }

              const batPath = path.join(distDir, "freeengine.bat");
              fs.writeFileSync(
                batPath,
                `@echo off\r\nstart "" "%~dp0freeengine.exe" %*\r\n`,
                "utf-8"
              );

              // 5. 返回结果
              res.setHeader("Content-Type", "application/json");
              res.end(
                JSON.stringify({
                  success: true,
                  projectName,
                  outputPath: distDir,
                  relativeDir: `dist/${projectName}`,
                  files: [
                    "freeengine.exe",
                    "freeengine.bat",
                    "data/entity/",
                    "data/scenes/",
                    "data/shaders/",
                    "data/logits/",
                    "data/global_assets/",
                    "data/profiles/engine.lock.json (LOCKED: debug=false, packing=false)",
                  ],
                })
              );
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
          });
        } else {
          next();
        }
      });
    },
  };
}

export default defineConfig({
  root: ".",
  server: {
    port: 3000,
    open: false,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  plugins: [freeEnginePackPlugin()],
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
