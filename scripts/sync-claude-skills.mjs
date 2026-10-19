import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const canonicalSkillsRoot = resolve(repositoryRoot, ".agents/skills");
const claudeSkillsRoot = resolve(repositoryRoot, ".claude/skills");
const manifestPath = resolve(claudeSkillsRoot, ".pilot-sync-manifest.json");

function frontmatterValue(source, key) {
  const match = source.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  if (!match) throw new Error(`Missing ${key} frontmatter.`);
  return match[1].replace(/^['"]|['"]$/g, "");
}

function adapterSource(name, description) {
  return `---\nname: ${JSON.stringify(name)}\ndescription: ${JSON.stringify(description)}\n---\n\n# Ryte ${name}\n\n$ARGUMENTS\n\nThis is Ryte's Claude adapter. The canonical workflow is local to this repository.\n\n1. Load \`.agents/skills/${name}/SKILL.md\` and follow it exactly.\n2. Preserve the canonical workflow's privacy, Electron-boundary, approval, and validation rules.\n3. Keep this adapter limited to discovery; do not add independent policy here.\n`;
}

async function listSkillNames() {
  const entries = await readdir(canonicalSkillsRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? listFiles(path) : [path];
    }),
  );
  return files.flat();
}

const skillNames = await listSkillNames();
for (const name of skillNames) {
  const canonicalPath = resolve(canonicalSkillsRoot, name, "SKILL.md");
  const canonicalSource = await readFile(canonicalPath, "utf8");
  const declaredName = frontmatterValue(canonicalSource, "name");
  if (declaredName !== name)
    throw new Error(`${canonicalPath} declares ${declaredName}.`);

  const adapterPath = resolve(claudeSkillsRoot, name, "SKILL.md");
  await mkdir(dirname(adapterPath), { recursive: true });
  await writeFile(
    adapterPath,
    adapterSource(name, frontmatterValue(canonicalSource, "description")),
  );
}

const manifestFiles = (await listFiles(claudeSkillsRoot))
  .filter((path) => path !== manifestPath)
  .sort();
const files = {};
for (const path of manifestFiles) {
  const content = await readFile(path);
  files[relative(claudeSkillsRoot, path)] = {
    sha256: createHash("sha256").update(content).digest("hex"),
    executableMode: 0,
  };
}

await writeFile(
  manifestPath,
  `${JSON.stringify({ version: 1, files }, null, 2)}\n`,
);
