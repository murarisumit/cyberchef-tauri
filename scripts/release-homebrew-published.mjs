import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import {spawnSync} from "node:child_process";
import {Readable} from "node:stream";
import {pipeline} from "node:stream/promises";
import {projectRoot} from "./lib.mjs";
import {readReleaseMetadata} from "./release-info.mjs";

function usage() {
    console.log(`Usage:
  npm run release:tap:published
  HOMEBREW_TAP_DIR=/absolute/path/to/homebrew-tap npm run release:tap:published
  npm run release:tap:published -- --tap-dir /absolute/path/to/homebrew-tap

Behavior:
  - reads the current release metadata from this repository
  - downloads the published GitHub release DMG for the current tag
  - regenerates the Homebrew cask from the downloaded artifact
  - writes the result into the local tap checkout
`);
}

function parseArgs(argv) {
    const args = argv.slice(2);
    const parsed = {
        tapDir: process.env.HOMEBREW_TAP_DIR || null,
        help: false,
    };

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];

        if (arg === "--help" || arg === "-h") {
            parsed.help = true;
        } else if (arg === "--tap-dir") {
            parsed.tapDir = args[index + 1];
            index += 1;
        } else {
            throw new Error(`Unexpected argument: ${arg}`);
        }
    }

    return parsed;
}

async function pathExists(targetPath) {
    try {
        await fsp.access(targetPath);
        return true;
    } catch {
        return false;
    }
}

async function downloadToFile(url, destinationPath) {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
        throw new Error(`Download response for ${url} did not include a body`);
    }

    await pipeline(
        Readable.fromWeb(response.body),
        fs.createWriteStream(destinationPath)
    );
}

function runNodeScript(scriptPath, args) {
    const result = spawnSync(process.execPath, [scriptPath, ...args], {
        cwd: projectRoot,
        stdio: "inherit",
        encoding: "utf8",
    });

    if (result.status !== 0) {
        throw new Error(`${path.basename(scriptPath)} failed with exit code ${result.status}`);
    }
}

async function main() {
    const {tapDir, help} = parseArgs(process.argv);

    if (help) {
        usage();
        return;
    }

    if (!tapDir) {
        throw new Error("Set HOMEBREW_TAP_DIR or pass --tap-dir.");
    }

    const resolvedTapDir = path.resolve(projectRoot, tapDir);

    if (!(await pathExists(resolvedTapDir))) {
        throw new Error(`Homebrew tap directory not found at ${resolvedTapDir}`);
    }

    const metadata = await readReleaseMetadata();
    const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "cyberchef-release-"));
    const downloadedArtifactPath = path.join(tempDir, metadata.releaseAssetName);

    try {
        console.log(`Downloading ${metadata.releaseDownloadUrl}`);
        await downloadToFile(metadata.releaseDownloadUrl, downloadedArtifactPath);

        runNodeScript(path.join(projectRoot, "scripts", "homebrew-cask.mjs"), [
            "--artifact",
            downloadedArtifactPath,
            "--output",
            path.join(resolvedTapDir, metadata.homebrewCaskPath),
        ]);
    } finally {
        await fsp.rm(tempDir, {recursive: true, force: true});
    }
}

try {
    await main();
} catch (error) {
    console.error(error.message);
    process.exit(1);
}
