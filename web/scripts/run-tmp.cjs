const { createJiti } = require("jiti");
const j = createJiti(__filename, { alias: { "@": require("path").resolve("src") } });
j.import("./" + process.argv[2]).catch((e) => { console.error(e); process.exit(1); });
