import {spawnSync} from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {projectRoot, vendoredCyberChefDir} from "./lib.mjs";

function usage() {
    console.log(`Usage:
  npm run release:cut
  npm run release:cut -- <app-version>
  npm run release:cut -- --dry-run
  npm run release:cut -- <app-version> --dry-run

Behavior:
  - bumps the app patch version when no app version is provided
  - keeps package.json, package-lock.json, and src-tauri/tauri.conf.json aligned
  - runs npm run release:check
  - creates a release commit and annotated tag
  - leaves the DMG build and tap sync to:
      npm run release:bundle
  - leaves pushing to you: git push && git push --tags
`);
}

function parseArgs(argv) {
    const args = argv.slice(2);
    const parsed = {
        appVersion: null,
        dryRun: false,
        help: false,
    };

    for (const arg of args) {
        if (arg === "--help" || arg === "-h") {
            parsed.help = true;
        } else if (arg === "--dry-run") {
            parsed.dryRun = true;
        } else if (!parsed.appVersion) {
            parsed.appVersion = arg;
        } else {
            throw new Error(`Unexpected argument: ${arg}`);
        }
    }

    return parsed;
}

function parseSemver(version) {
    const match = String(version || "").trim().match(/^(\d+)\.(\d+)\.(\d+)$/);

    if (!match) {
        throw new Error(
            `Invalid version "${version}". Expected a plain semver value like 0.1.1`
        );
    }

    return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
    };
}

function bumpPatch(version) {
    const parsed = parseSemver(version);
    return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
}

async function readJson(filePath) {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
    await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function run(command, args, options = {}) {
    const result = spawnSync(command, args, {
        cwd: projectRoot,
        stdio: options.captureOutput ? ["ignore", "pipe", "pipe"] : "inherit",
        encoding: "utf8",
    });

    if (result.status !== 0) {
        if (options.captureOutput) {
            const stderr = (result.stderr || "").trim();
            const stdout = (result.stdout || "").trim();
            throw new Error(stderr || stdout || `${command} ${args.join(" ")} failed`);
        }

        throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
    }

    return options.captureOutput ? result.stdout.trim() : "";
}

function ensureNoTrackedGitChanges() {
    run("git", ["diff", "--quiet"]);
    run("git", ["diff", "--cached", "--quiet"]);
}

function ensureTagAbsent(tagName) {
    const result = spawnSync("git", ["rev-parse", "-q", "--verify", `refs/tags/${tagName}`], {
        cwd: projectRoot,
        stdio: "ignore",
    });

    if (result.status === 0) {
        throw new Error(`Git tag already exists: ${tagName}`);
    }
}

async function main() {
    const {appVersion: requestedVersion, dryRun, help} = parseArgs(process.argv);

    if (help) {
        usage();
        return;
    }

    ensureNoTrackedGitChanges();

    const packageJsonPath = path.join(projectRoot, "package.json");
    const packageLockPath = path.join(projectRoot, "package-lock.json");
    const tauriConfigPath = path.join(projectRoot, "src-tauri", "tauri.conf.json");
    const cyberChefPackagePath = path.join(vendoredCyberChefDir, "package.json");

    const packageJson = await readJson(packageJsonPath);
    const packageLock = await readJson(packageLockPath);
    const tauriConfig = await readJson(tauriConfigPath);
    const cyberChefPackage = await readJson(cyberChefPackagePath);

    parseSemver(packageJson.version);
    parseSemver(tauriConfig.package.version);

    if (packageJson.version !== tauriConfig.package.version) {
        throw new Error(
            `App version mismatch before release cut: package.json=${packageJson.version}, ` +
            `tauri.conf.json=${tauriConfig.package.version}`
        );
    }

    const nextVersion = requestedVersion ? requestedVersion.trim() : bumpPatch(packageJson.version);
    parseSemver(nextVersion);

    if (nextVersion === packageJson.version) {
        throw new Error(`Target version ${nextVersion} matches the current app version`);
    }

    const cyberChefVersion = cyberChefPackage.version;
    const releaseTag = `v${nextVersion}-cyberchef.${cyberChefVersion}`;
    const releaseMessage = `App ${nextVersion} bundled with CyberChef ${cyberChefVersion}`;
    const commitMessage = `chore(release): app ${nextVersion} with CyberChef ${cyberChefVersion}`;

    ensureTagAbsent(releaseTag);

    if (dryRun) {
        console.log(`Dry run complete.
Current app version: ${packageJson.version}
Next app version: ${nextVersion}
Release tag: ${releaseTag}
Release commit: ${commitMessage}`);
        return;
    }

    packageJson.version = nextVersion;
    tauriConfig.package.version = nextVersion;

    if (packageLock.version) {
        packageLock.version = nextVersion;
    }

    if (packageLock.packages && packageLock.packages[""]) {
        packageLock.packages[""].version = nextVersion;
    }

    await writeJson(packageJsonPath, packageJson);
    await writeJson(packageLockPath, packageLock);
    await writeJson(tauriConfigPath, tauriConfig);

    run("npm", ["run", "release:check"]);
    run("git", ["add", "--", "package.json", "package-lock.json", "src-tauri/tauri.conf.json"]);
    run("git", ["commit", "-m", commitMessage]);
    run("git", ["tag", "-a", releaseTag, "-m", releaseMessage]);

    console.log(`Release prepared.
Version: ${nextVersion}
Tag: ${releaseTag}

Push with:
git push
git push --tags

Then update the local Homebrew tap:
npm run release:bundle`);
}

try {
    await main();
} catch (error) {
    console.error(error.message);
    process.exit(1);
}
