#!/usr/bin/env node
/**
 * Publishes the live resume and site content to R2.
 *
 * The deployed Worker reads `content.json` and `resume.pdf` straight out of
 * the bucket, so either can be replaced without rebuilding or redeploying the
 * site. Content is validated here rather than in production: a malformed
 * upload should fail at the terminal, not silently fall back on the live site.
 *
 *   node scripts/publish.mjs content
 *   node scripts/publish.mjs resume ~/Downloads/NewResume.pdf
 *   node scripts/publish.mjs all     ~/Downloads/NewResume.pdf
 */
import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUCKET = "msicard-portfolio-content";
const CONTENT_PATH = resolve(root, "content/content.json");

const REQUIRED_TOP_LEVEL = [
  "meta",
  "summary",
  "links",
  "experience",
  "projects",
  "contact",
  "skills",
  "education",
  "certifications",
];

function fail(message) {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

function validateContent() {
  let raw;
  try {
    raw = readFileSync(CONTENT_PATH, "utf8");
  } catch {
    fail(`Cannot read ${CONTENT_PATH}`);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    fail(`content.json is not valid JSON: ${error.message}`);
  }

  const missing = REQUIRED_TOP_LEVEL.filter((key) => !(key in data));
  if (missing.length) fail(`content.json is missing: ${missing.join(", ")}`);

  if (!data.meta?.name) fail("content.json is missing meta.name");
  for (const key of ["experience", "projects", "skills"]) {
    if (!Array.isArray(data[key])) fail(`content.json: ${key} must be an array`);
  }
  const bytes = Buffer.byteLength(raw);
  console.log(
    `  ✓ content.json valid - ${data.experience.length} roles, ` +
      `${data.projects.length} projects, ${data.skills.length} skill groups ` +
      `(${(bytes / 1024).toFixed(1)} kB)`,
  );
}

function put(key, file, contentType) {
  const result = spawnSync(
    "npx",
    [
      "wrangler",
      "r2",
      "object",
      "put",
      `${BUCKET}/${key}`,
      "--file",
      file,
      "--content-type",
      contentType,
      "--remote",
    ],
    { stdio: "inherit", cwd: root },
  );
  if (result.status !== 0) fail(`Upload of ${key} failed`);
  console.log(`  ✓ ${key} is live`);
}

const [command, argument] = process.argv.slice(2);

switch (command) {
  case "content": {
    validateContent();
    put("content.json", CONTENT_PATH, "application/json");
    break;
  }
  case "resume": {
    if (!argument) fail("Usage: node scripts/publish.mjs resume <path-to.pdf>");
    const file = resolve(process.cwd(), argument);
    if (!statSync(file, { throwIfNoEntry: false })?.isFile()) {
      fail(`No such file: ${file}`);
    }
    if (readFileSync(file).subarray(0, 4).toString() !== "%PDF") {
      fail(`${file} is not a PDF`);
    }
    put("resume.pdf", file, "application/pdf");
    break;
  }
  case "all": {
    if (!argument) fail("Usage: node scripts/publish.mjs all <path-to.pdf>");
    validateContent();
    put("content.json", CONTENT_PATH, "application/json");
    const file = resolve(process.cwd(), argument);
    if (readFileSync(file).subarray(0, 4).toString() !== "%PDF") {
      fail(`${file} is not a PDF`);
    }
    put("resume.pdf", file, "application/pdf");
    break;
  }
  default:
    console.log(`
  Publish the live resume and site content to R2.

    node scripts/publish.mjs content              push content/content.json
    node scripts/publish.mjs resume <file.pdf>    push a new resume PDF
    node scripts/publish.mjs all    <file.pdf>    push both

  Neither requires a rebuild or redeploy. Changes are live within a minute.
`);
    process.exit(command ? 1 : 0);
}
