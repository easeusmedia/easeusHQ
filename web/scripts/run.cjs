// Runs a TypeScript script in this folder with the app's own "@/..." paths.
//   node --env-file=.env scripts/run.cjs scripts/<name>.ts [args]
const { resolve } = require("path");
const { createJiti } = require("jiti");
const jiti = createJiti(__filename, { alias: { "@": resolve(__dirname, "..", "src") } });
jiti.import(resolve(process.cwd(), process.argv[2])).catch((e) => {
  console.error(e);
  process.exit(1);
});
