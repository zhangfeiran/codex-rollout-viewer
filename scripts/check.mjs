import { readFile, readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const projectDir = path.resolve(import.meta.dirname, "..");
const files = [
  "content-loader.js",
  "rollout-renderer.js"
].map(file => path.resolve(projectDir, file));

async function addJsFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const fullPath = path.resolve(dir, entry.name);
    if (entry.isDirectory()) {
      await addJsFiles(fullPath);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(fullPath);
    }
  }
}

async function checkFile(file) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--check", file], { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", code => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`node --check failed for ${path.relative(projectDir, file)}`));
    });
  });
}

async function checkStandaloneHtml() {
  const file = path.resolve(projectDir, "standalone.html");
  const html = await readFile(file, "utf8");
  const begin = "/* BEGIN embedded rollout-renderer.js */";
  const end = "/* END embedded rollout-renderer.js */";
  const beginIndex = html.indexOf(begin);
  const endIndex = html.indexOf(end);
  if (beginIndex < 0 || endIndex < 0 || endIndex <= beginIndex) {
    throw new Error("standalone.html must embed rollout-renderer.js between sync markers");
  }

  const embeddedRenderer = html.slice(beginIndex + begin.length, endIndex).trim();
  const renderer = (await readFile(path.resolve(projectDir, "rollout-renderer.js"), "utf8")).replace(/\r\n/g, "\n").trim();
  if (/<\/script/i.test(renderer)) {
    throw new Error("rollout-renderer.js contains a closing script tag and cannot be embedded in standalone.html");
  }
  if (embeddedRenderer.replace(/\r\n/g, "\n") !== renderer) {
    throw new Error("standalone.html embedded rollout renderer is out of sync with rollout-renderer.js");
  }

  const bootScript = html.slice(endIndex + end.length, html.indexOf("</script>", endIndex));
  try {
    new Function(bootScript);
  } catch (error) {
    throw new Error(`standalone.html boot script has invalid syntax: ${error.message}`);
  }
}

await addJsFiles(path.resolve(projectDir, "vendor"));

for (const file of files) {
  await checkFile(file);
}

await checkStandaloneHtml();

const manifest = JSON.parse(await readFile(path.resolve(projectDir, "manifest.json"), "utf8"));
if (manifest.manifest_version !== 3) {
  throw new Error("manifest.json must be MV3");
}

console.log(`Checked ${files.length} JavaScript files and standalone.html.`);
