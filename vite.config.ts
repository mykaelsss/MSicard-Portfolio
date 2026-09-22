import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * In production the Worker serves `/api/content` and `/resume.pdf` out of R2.
 * This middleware mirrors those two routes against the local files so
 * `vite dev` behaves like the deployed site.
 */
function localContentApi(): Plugin {
  return {
    name: "local-content-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");

        if (url.pathname === "/api/content") {
          try {
            const body = await readFile(
              resolve(import.meta.dirname, "content/content.json"),
              "utf8",
            );
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.setHeader("Cache-Control", "no-store");
            res.setHeader("X-Content-Source", "local");
            res.end(body);
          } catch {
            res.statusCode = 500;
            res.end('{"error":"content.json unreadable"}');
          }
          return;
        }

        /*
         * The Worker's contact endpoint, stubbed. It validates the same shape
         * so a broken payload still fails here, then prints the message and
         * stops: dev has no Turnstile secret and no mail key, and a local run
         * should never be able to put real mail in a real inbox. The reply
         * says `delivered: false` so this can never be mistaken for a send.
         */
        if (url.pathname === "/api/contact") {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.end('{"ok":false,"error":"method"}');
            return;
          }

          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);

          res.setHeader("Content-Type", "application/json; charset=utf-8");
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            const bad =
              !body.name?.trim() ||
              !/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(body.email ?? "") ||
              (body.message ?? "").trim().length < 20;

            if (bad) {
              res.statusCode = 422;
              res.end('{"ok":false,"error":"bad_message"}');
              return;
            }

            server.config.logger.info(
              `\n[contact] dev only, nothing was sent\n` +
                `  from: ${body.name} <${body.email}>\n` +
                `  ${String(body.message).replace(/\n/g, "\n  ")}\n`,
            );
            res.end('{"ok":true,"delivered":false}');
          } catch {
            res.statusCode = 400;
            res.end('{"ok":false,"error":"bad_json"}');
          }
          return;
        }

        if (url.pathname === "/resume.pdf") {
          try {
            const body = await readFile(
              resolve(import.meta.dirname, "public/resume.pdf"),
            );
            res.setHeader("Content-Type", "application/pdf");
            res.setHeader(
              "Content-Disposition",
              url.searchParams.has("download")
                ? 'attachment; filename="Mykael-Sicard-Resume.pdf"'
                : 'inline; filename="Mykael-Sicard-Resume.pdf"',
            );
            res.end(body);
          } catch {
            res.statusCode = 404;
            res.end("resume.pdf not found");
          }
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localContentApi()],
  build: {
    target: "es2022",
    cssTarget: "chrome110",
    /* Split the animation runtime out so the app shell can be cached
       independently of GSAP and Lenis. */
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          /* SplitText is reached only through the lazily imported reveal
             module, so it is left for Rollup to place with that importer.
             Naming it here would have pulled it back into the eager chunk
             and undone the split. */
          if (id.includes("node_modules/gsap/SplitText")) return undefined;
          if (id.includes("node_modules/gsap") || id.includes("node_modules/lenis")) {
            return "motion";
          }
          return undefined;
        },
      },
    },
  },
});
