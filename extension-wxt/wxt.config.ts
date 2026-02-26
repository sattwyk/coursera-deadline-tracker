import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  targetBrowsers: ["chrome"],
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Coursera Deadline Tracker",
    description: "Register, capture Coursera session cookies, and trigger deadline sync.",
    permissions: ["cookies", "storage", "alarms", "webRequest"],
    host_permissions: [
      "https://*.coursera.org/*",
      "http://127.0.0.1/*",
      "http://localhost/*",
      "https://*.workers.dev/*",
    ],
    action: {
      default_title: "Coursera Deadline Tracker",
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
