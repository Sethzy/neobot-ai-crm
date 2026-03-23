/**
 * Loads the committed property showcase template files for first-run Sprite setup.
 * @module lib/sandbox/templates/property-showcase/template-files
 */
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface TemplateFile {
  relativePath: string;
  content: string;
}

const TEMPLATE_FILE_PATHS = [
  ".gitignore",
  "build.sh",
  "index.html",
  "package.json",
  "tsconfig.json",
  "vite.config.ts",
  "src/App.tsx",
  "src/components/AgentContact.tsx",
  "src/components/Comparables.tsx",
  "src/components/Hero.tsx",
  "src/components/MortgageCalc.tsx",
  "src/components/NeighborhoodMap.tsx",
  "src/components/PhotoGallery.tsx",
  "src/components/PropertyDetails.tsx",
  "src/data/property.json",
  "src/main.tsx",
  "src/styles/globals.css",
  "src/types.ts",
] as const;

let templateFilesPromise: Promise<TemplateFile[]> | null = null;

/**
 * Returns all committed property showcase template files as relative-path/content pairs.
 */
export async function getPropertyShowcaseTemplateFiles(): Promise<TemplateFile[]> {
  if (!templateFilesPromise) {
    templateFilesPromise = loadTemplateFiles();
  }

  return templateFilesPromise;
}

async function loadTemplateFiles(): Promise<TemplateFile[]> {
  const templateDirectory = dirname(fileURLToPath(import.meta.url));

  return Promise.all(
    TEMPLATE_FILE_PATHS.map(async (relativePath) => ({
      relativePath,
      content: await readFile(resolve(templateDirectory, relativePath), "utf8"),
    })),
  );
}
