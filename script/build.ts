import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    // server/vite.ts динамически импортируется только в dev
    // (см. server/index.ts: `if (NODE_ENV === 'development') await
    // import("./vite")`). esbuild всё равно затягивал его в bundle и
    // вместе с ним — vite.config.ts с import.meta.dirname (что в CJS
    // = empty, отсюда 5 warnings) и весь vite-плагин-стек. Маркируем
    // server/vite.ts как external, чтобы он не попал в production
    // bundle. В production файла нет, но dynamic import под флагом
    // dev никогда не выполняется — безопасно.
    plugins: [
      {
        name: "exclude-vite-bridge",
        setup(b) {
          b.onResolve({ filter: /^\.\/vite$/ }, (args) => {
            if (args.importer.endsWith("server/index.ts") || args.importer.endsWith("server\\index.ts")) {
              return { path: args.path, external: true };
            }
            return null;
          });
        },
      },
    ],
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
