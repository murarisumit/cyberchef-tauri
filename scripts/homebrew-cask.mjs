import {createHash} from "node:crypto";
import {createReadStream} from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
    homebrewCaskPath,
    homebrewCaskToken,
    projectRoot,
    tauriBundleDmgDir,
} from "./lib.mjs";
import {readReleaseMetadata} from "./release-info.mjs";

function usage() {
    console.log(`Usage:
  npm run release:homebrew -- --artifact /absolute/path/to/CyberChef.dmg
  npm run release:tap
  npm run release:homebrew -- --sha256 <sha256>
  npm run release:homebrew -- --artifact /path/to/CyberChef.dmg --output ./Casks/${homebrewCaskToken}.rb

Behavior:
  - reads release metadata from this repository
  - renders a Homebrew cask for the matching release tag
  - can sync the cask into a local tap when --sync-tap or HOMEBREW_TAP_DIR is used
  - auto-discovers the newest built DMG when syncing a tap and --artifact is omitted
  - computes sha256 from --artifact unless --sha256 is provided
  - prints to stdout unless --output is provided
`);
}

function parseArgs(argv) {
    const args = argv.slice(2);
    const parsed = {
        artifactPath: null,
        sha256: null,
        outputPath: null,
        tapDir: process.env.HOMEBREW_TAP_DIR || null,
        githubOutput: false,
        syncTap: false,
        help: false,
    };

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];

        if (arg === "--help" || arg === "-h") {
            parsed.help = true;
        } else if (arg === "--artifact") {
            parsed.artifactPath = args[index + 1];
            index += 1;
        } else if (arg === "--sha256") {
            parsed.sha256 = args[index + 1];
            index += 1;
        } else if (arg === "--output") {
            parsed.outputPath = args[index + 1];
            index += 1;
        } else if (arg === "--tap-dir") {
            parsed.tapDir = args[index + 1];
            index += 1;
        } else if (arg === "--github-output") {
            parsed.githubOutput = true;
        } else if (arg === "--sync-tap") {
            parsed.syncTap = true;
        } else {
            throw new Error(`Unexpected argument: ${arg}`);
        }
    }

    return parsed;
}

function validateSha256(value) {
    if (!/^[0-9a-f]{64}$/i.test(String(value || ""))) {
        throw new Error("Expected a 64-character hexadecimal SHA-256 value");
    }

    return value.toLowerCase();
}

async function sha256File(filePath) {
    const hash = createHash("sha256");

    await new Promise((resolve, reject) => {
        const stream = createReadStream(filePath);
        stream.on("data", chunk => hash.update(chunk));
        stream.on("error", reject);
        stream.on("end", resolve);
    });

    return hash.digest("hex");
}

async function pathExists(targetPath) {
    try {
        await fs.access(targetPath);
        return true;
    } catch {
        return false;
    }
}

async function resolveBuiltDmgPath(metadata) {
    if (!(await pathExists(tauriBundleDmgDir))) {
        throw new Error(
            `No DMG bundle directory found at ${tauriBundleDmgDir}. Run npm run tauri build first.`
        );
    }

    const entries = await fs.readdir(tauriBundleDmgDir, {withFileTypes: true});
    const dmgEntries = entries
        .filter(entry => entry.isFile() && entry.name.endsWith(".dmg"))
        .map(entry => entry.name);

    if (dmgEntries.length === 0) {
        throw new Error(`No .dmg file found in ${tauriBundleDmgDir}. Run npm run tauri build first.`);
    }

    const matchingEntries = dmgEntries.filter(name => name.includes(metadata.appVersion));

    if (matchingEntries.length === 0) {
        throw new Error(
            `No built DMG for app version ${metadata.appVersion} found in ${tauriBundleDmgDir}. ` +
            "Run npm run tauri build after cutting the release version, or pass --artifact."
        );
    }

    const stats = await Promise.all(
        matchingEntries.map(async name => ({
            name,
            filePath: path.join(tauriBundleDmgDir, name),
            stat: await fs.stat(path.join(tauriBundleDmgDir, name)),
        }))
    );

    stats.sort((left, right) => right.stat.mtimeMs - left.stat.mtimeMs);
    return stats[0].filePath;
}

function resolveTapOutputPath(tapDir) {
    return path.join(tapDir, homebrewCaskPath);
}

function validateArtifactMatchesVersion(filePath, metadata) {
    const fileName = path.basename(filePath);

    if (!fileName.includes(metadata.appVersion)) {
        throw new Error(
            `Artifact ${fileName} does not appear to match app version ${metadata.appVersion}. ` +
            "Build the current release first, or pass a matching DMG path."
        );
    }
}

function renderCask(metadata, sha256) {
    return `cask "${metadata.homebrewCaskToken}" do
  version "${metadata.homebrewVersion}"
  sha256 "${sha256}"

  url "${metadata.sourceRepositoryUrl}/releases/download/v#{version}/${metadata.releaseAssetName.replace(metadata.releaseTag, 'v#{version}')}",
      verified: "github.com/${metadata.sourceRepository}/"
  name "CyberChef"
  desc "CyberChef desktop app packaged with Tauri"
  homepage "${metadata.sourceRepositoryUrl}"

  app "CyberChef.app"
end
`;
}

async function writeGithubOutput({sha256, outputPath}) {
    const githubOutput = process.env.GITHUB_OUTPUT;

    if (!githubOutput) {
        throw new Error("GITHUB_OUTPUT is not set");
    }

    const lines = [
        `sha256=${sha256}`,
        `cask_token=${homebrewCaskToken}`,
        `cask_path=${homebrewCaskPath}`,
        `output_path=${outputPath || ""}`,
    ];

    await fs.appendFile(githubOutput, `${lines.join("\n")}\n`);
}

async function main() {
    const {artifactPath, sha256, outputPath, tapDir, githubOutput, syncTap, help} =
        parseArgs(process.argv);

    if (help) {
        usage();
        return;
    }

    const metadata = await readReleaseMetadata();
    const shouldSyncTap = syncTap || Boolean(tapDir);
    const resolvedTapDir = tapDir ? path.resolve(projectRoot, tapDir) : null;
    const resolvedArtifactPath = artifactPath
        ? path.resolve(projectRoot, artifactPath)
        : (!sha256 && shouldSyncTap ? await resolveBuiltDmgPath(metadata) : null);
    const resolvedOutputPath = outputPath
        ? path.resolve(projectRoot, outputPath)
        : (shouldSyncTap
            ? resolveTapOutputPath(
                resolvedTapDir ||
                (() => {
                    throw new Error(
                        "Set HOMEBREW_TAP_DIR or pass --tap-dir when using --sync-tap."
                    );
                })()
            )
            : null);

    if (!resolvedArtifactPath && !sha256) {
        throw new Error("Provide either --artifact or --sha256");
    }

    if (resolvedArtifactPath) {
        validateArtifactMatchesVersion(resolvedArtifactPath, metadata);
    }

    const resolvedSha256 = sha256
        ? validateSha256(sha256)
        : await sha256File(resolvedArtifactPath);
    const caskContents = renderCask(metadata, resolvedSha256);

    if (resolvedOutputPath) {
        await fs.mkdir(path.dirname(resolvedOutputPath), {recursive: true});
        await fs.writeFile(resolvedOutputPath, caskContents);
        console.log(`Wrote ${resolvedOutputPath}`);
    } else {
        process.stdout.write(caskContents);
    }

    if (githubOutput) {
        await writeGithubOutput({
            sha256: resolvedSha256,
            outputPath,
        });
    }
}

try {
    await main();
} catch (error) {
    console.error(error.message);
    process.exit(1);
}
