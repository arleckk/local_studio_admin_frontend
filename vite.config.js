import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget = env.VITE_DEV_PROXY_TARGET?.trim();

  return {
    plugins: [react()],
    server: {
      host: "0.0.0.0",
      allowedHosts: ["desktop-rpoe8ht.tail854b07.ts.net"],
      ...(proxyTarget
        ? {
            proxy: {
              "/api": {
                target: proxyTarget,
                changeOrigin: true,
              },
              "/health": {
                target: proxyTarget,
                changeOrigin: true,
              },
            },
          }
        : {}),
    },
  };
});
