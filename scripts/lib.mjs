import {spawn} from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const projectRoot = path.resolve(__dirname, "..");
export const stagedDistDir = path.join(projectRoot, ".artifacts", "cyberchef-dist");
export const vendoredCyberChefDir = path.join(projectRoot, "vendor", "cyberchef");
export const cyberChefPublicDir = path.join(vendoredCyberChefDir, "public");
export const vendorMetadataPath = path.join(projectRoot, "vendor", "cyberchef.vendor.json");
export const wrapperAssetsDir = path.join(projectRoot, "wrapper-assets");
export const cyberChefMirrorBranch =
    process.env.CYBERCHEF_MIRROR_BRANCH || "upstream/cyberchef";
export const tauriBundleDmgDir = path.join(
    projectRoot,
    "src-tauri",
    "target",
    "release",
    "bundle",
    "dmg"
);
export const githubRepo = "murarisumit/cyberchef-tauri";
export const githubRepoUrl = `https://github.com/${githubRepo}`;
export const homebrewTapName = "murarisumit/tap";
export const homebrewTapRepo = "murarisumit/homebrew-tap";
export const homebrewCaskToken = "cyberchef-tauri";
export const homebrewCaskPath = `Casks/${homebrewCaskToken}.rb`;
const currentNodeBinDir = path.dirname(process.execPath);

export function buildReleaseTag(appVersion, cyberChefVersion) {
    return `v${appVersion}-cyberchef.${cyberChefVersion}`;
}

export function buildReleaseAssetName(releaseTag) {
    return `CyberChef-${releaseTag}-macos.dmg`;
}

export function buildReleaseDownloadUrl(releaseTag) {
    return `${githubRepoUrl}/releases/download/${releaseTag}/${buildReleaseAssetName(releaseTag)}`;
}

function shellEscape(value) {
    return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

async function pathExists(targetPath) {
    try {
        await fs.access(targetPath);
        return true;
    } catch {
        return false;
    }
}

async function applyWrapperOverrides() {
    const stagedIndexPath = path.join(stagedDistDir, "index.html");
    const stagedFontOverridePath = path.join(stagedDistDir, "tauri-font-override.css");
    const stagedDesktopBridgePath = path.join(stagedDistDir, "tauri-desktop.js");
    const stagedSettingsPagePath = path.join(stagedDistDir, "settings.html");
    const stagedSettingsScriptPath = path.join(stagedDistDir, "tauri-settings.js");
    const stagedSettingsStylesPath = path.join(stagedDistDir, "tauri-settings.css");
    const sourceFontOverridePath = path.join(wrapperAssetsDir, "tauri-font-override.css");
    const sourceDesktopBridgePath = path.join(wrapperAssetsDir, "tauri-desktop.js");
    const sourceSettingsPagePath = path.join(wrapperAssetsDir, "settings.html");
    const sourceSettingsScriptPath = path.join(wrapperAssetsDir, "tauri-settings.js");
    const sourceSettingsStylesPath = path.join(wrapperAssetsDir, "tauri-settings.css");
    const fontOverrideTag = '<link href="tauri-font-override.css" rel="stylesheet">';
    const desktopBridgeTag = '<script defer="defer" src="tauri-desktop.js"></script>';

    if (!(await pathExists(stagedIndexPath))) {
        throw new Error(`Staged CyberChef index not found at ${stagedIndexPath}`);
    }

    if (!(await pathExists(sourceFontOverridePath))) {
        throw new Error(`Wrapper font override not found at ${sourceFontOverridePath}`);
    }

    if (!(await pathExists(sourceDesktopBridgePath))) {
        throw new Error(`Wrapper desktop bridge not found at ${sourceDesktopBridgePath}`);
    }

    if (!(await pathExists(sourceSettingsPagePath))) {
        throw new Error(`Wrapper settings page not found at ${sourceSettingsPagePath}`);
    }

    if (!(await pathExists(sourceSettingsScriptPath))) {
        throw new Error(`Wrapper settings script not found at ${sourceSettingsScriptPath}`);
    }

    if (!(await pathExists(sourceSettingsStylesPath))) {
        throw new Error(`Wrapper settings stylesheet not found at ${sourceSettingsStylesPath}`);
    }

    const indexHtml = await fs.readFile(stagedIndexPath, "utf8");
    let updatedIndexHtml = indexHtml;

    if (!updatedIndexHtml.includes(fontOverrideTag)) {
        updatedIndexHtml = updatedIndexHtml.replace("</head>", `${fontOverrideTag}</head>`);
    }

    if (!updatedIndexHtml.includes(desktopBridgeTag)) {
        updatedIndexHtml = updatedIndexHtml.replace("</head>", `${desktopBridgeTag}</head>`);
    }

    if (updatedIndexHtml === indexHtml &&
        (!indexHtml.includes(fontOverrideTag) || !indexHtml.includes(desktopBridgeTag))) {
        throw new Error(`Unable to inject wrapper font override into ${stagedIndexPath}`);
    }

    await fs.copyFile(sourceFontOverridePath, stagedFontOverridePath);
    await fs.copyFile(sourceDesktopBridgePath, stagedDesktopBridgePath);
    await fs.copyFile(sourceSettingsPagePath, stagedSettingsPagePath);
    await fs.copyFile(sourceSettingsScriptPath, stagedSettingsScriptPath);
    await fs.copyFile(sourceSettingsStylesPath, stagedSettingsStylesPath);
    await fs.writeFile(stagedIndexPath, updatedIndexHtml);
}

export async function syncDevWrapperAssets() {
    const sourceSettingsPagePath = path.join(wrapperAssetsDir, "settings.html");
    const sourceSettingsScriptPath = path.join(wrapperAssetsDir, "tauri-settings.js");
    const sourceSettingsStylesPath = path.join(wrapperAssetsDir, "tauri-settings.css");
    const targetSettingsPagePath = path.join(cyberChefPublicDir, "settings.html");
    const targetSettingsScriptPath = path.join(cyberChefPublicDir, "tauri-settings.js");
    const targetSettingsStylesPath = path.join(cyberChefPublicDir, "tauri-settings.css");

    await fs.mkdir(cyberChefPublicDir, {recursive: true});
    await fs.copyFile(sourceSettingsPagePath, targetSettingsPagePath);
    await fs.copyFile(sourceSettingsScriptPath, targetSettingsScriptPath);
    await fs.copyFile(sourceSettingsStylesPath, targetSettingsStylesPath);
}

async function resolveNvmScript() {
    const candidates = [
        path.join(os.homedir(), ".config", "nvm", "nvm.sh"),
        path.join(os.homedir(), ".nvm", "nvm.sh"),
        "/opt/homebrew/opt/nvm/nvm.sh",
    ];

    for (const candidate of candidates) {
        if (await pathExists(candidate)) return candidate;
    }

    return null;
}

async function readNvmrc(cyberChefDir) {
    try {
        return (await fs.readFile(path.join(cyberChefDir, ".nvmrc"), "utf8")).trim();
    } catch {
        return null;
    }
}

function resolveNodeMajor(version) {
    const match = String(version || "").trim().match(/^v?(\d+)(?:\..*)?$/);
    return match ? match[1] : null;
}

function currentNodeMatchesNvmrc(nvmrcValue) {
    const requestedMajor = resolveNodeMajor(nvmrcValue);
    const currentMajor = resolveNodeMajor(process.version);

    if (!requestedMajor || !currentMajor) return false;

    return requestedMajor === currentMajor;
}

export async function resolveCyberChefDir(options = {}) {
    const {optional = false} = options;
    const configured = process.env.CYBERCHEF_DIR;
    const cyberChefDir = path.resolve(projectRoot, configured || vendoredCyberChefDir);

    const requiredPaths = [
        path.join(cyberChefDir, "package.json"),
        path.join(cyberChefDir, "Gruntfile.js"),
    ];

    for (const requiredPath of requiredPaths) {
        if (!(await pathExists(requiredPath))) {
            if (optional) return null;
            throw new Error(`CyberChef checkout not found at ${cyberChefDir}`);
        }
    }

    return cyberChefDir;
}

function createFilteredWriter(stream, suppressPatterns = [], suppressBlocks = []) {
    let buffer = "";
    let activeSuppressBlock = null;

    function shouldSuppressLine(line) {
        if (activeSuppressBlock) {
            if (activeSuppressBlock.end.test(line)) {
                activeSuppressBlock = null;
            }

            return true;
        }

        const matchingBlock = suppressBlocks.find(block => block.start.test(line));

        if (matchingBlock) {
            activeSuppressBlock = matchingBlock;
            if (matchingBlock.end.test(line)) {
                activeSuppressBlock = null;
            }

            return true;
        }

        return suppressPatterns.some(pattern => pattern.test(line));
    }

    return {
        write(chunk) {
            buffer += chunk.toString();
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() || "";

            for (const line of lines) {
                if (!shouldSuppressLine(line)) {
                    stream.write(`${line}\n`);
                }
            }
        },
        flush() {
            if (!buffer) return;

            if (!shouldSuppressLine(buffer)) {
                stream.write(buffer);
            }

            buffer = "";
        }
    };
}

export async function runBash(command, cwd = projectRoot, options = {}) {
    const {suppressOutputBlocks = [], suppressOutputPatterns = []} = options;
    const env = {
        ...process.env,
        NODE: process.execPath,
        PATH: `${currentNodeBinDir}${path.delimiter}${process.env.PATH || ""}`,
    };

    // npm exports its own config as npm_config_* when it runs a script, so any
    // wrapper command invoked through `npm run` inherits npm_config_prefix.
    // nvm refuses to load while that is set, which breaks the vendored build
    // for anyone whose npm has a configured prefix, such as a Homebrew node.
    for (const key of Object.keys(env)) {
        if (key.toLowerCase() === "npm_config_prefix") delete env[key];
    }

    await new Promise((resolve, reject) => {
        const child = spawn("bash", ["-c", command], {
            cwd,
            env,
            stdio: suppressOutputPatterns.length ? ["inherit", "pipe", "pipe"] : "inherit",
        });

        let stdoutWriter = null;
        let stderrWriter = null;

        if (suppressOutputPatterns.length || suppressOutputBlocks.length) {
            stdoutWriter = createFilteredWriter(
                process.stdout,
                suppressOutputPatterns,
                suppressOutputBlocks
            );
            stderrWriter = createFilteredWriter(
                process.stderr,
                suppressOutputPatterns,
                suppressOutputBlocks
            );
            child.stdout.on("data", chunk => stdoutWriter.write(chunk));
            child.stderr.on("data", chunk => stderrWriter.write(chunk));
        }

        child.on("exit", code => {
            stdoutWriter?.flush();
            stderrWriter?.flush();
            if (code === 0) resolve();
            else reject(new Error(`Command failed with exit code ${code}: ${command}`));
        });

        child.on("error", reject);
    });
}

export async function runInCyberChefShell(command, options = {}) {
    const cyberChefDir = await resolveCyberChefDir();
    const nvmScript = await resolveNvmScript();
    const nvmrcValue = await readNvmrc(cyberChefDir);
    const shouldUseNvm =
        Boolean(nvmrcValue) &&
        Boolean(nvmScript) &&
        process.env.CYBERCHEF_SKIP_NVM !== "1" &&
        !currentNodeMatchesNvmrc(nvmrcValue);

    const steps = [`cd ${shellEscape(cyberChefDir)}`];

    if (shouldUseNvm) {
        steps.unshift(`source ${shellEscape(nvmScript)}`);
        steps.unshift("unset npm_config_prefix");
        steps.push("nvm install >/dev/null");
        steps.push("nvm use >/dev/null");
    }

    steps.push(command);

    await runBash(steps.join(" && "), projectRoot, options);
}

export async function stageCyberChefBuild() {
    const cyberChefDir = await resolveCyberChefDir();
    const sourceDir = path.join(cyberChefDir, "build", "prod");

    if (!(await pathExists(sourceDir))) {
        throw new Error(`CyberChef build output not found at ${sourceDir}`);
    }

    await fs.rm(stagedDistDir, {recursive: true, force: true});
    await fs.mkdir(path.dirname(stagedDistDir), {recursive: true});
    await fs.cp(sourceDir, stagedDistDir, {recursive: true});
    await applyWrapperOverrides();
}

export async function validateStagedDist() {
    const requiredPaths = [
        path.join(stagedDistDir, "index.html"),
        path.join(stagedDistDir, "assets"),
        path.join(stagedDistDir, "modules"),
    ];

    for (const requiredPath of requiredPaths) {
        if (!(await pathExists(requiredPath))) {
            throw new Error(
                `Staged CyberChef dist not found or incomplete at ${stagedDistDir}`
            );
        }
    }

    return stagedDistDir;
}

export async function detectInstalledNodeModules() {
    const cyberChefDir = await resolveCyberChefDir({optional: true});
    if (!cyberChefDir) return false;

    return pathExists(path.join(cyberChefDir, "node_modules"));
}

async function runCapture(command, args, options = {}) {
    return new Promise(resolve => {
        const child = spawn(command, args, {
            ...options,
            stdio: ["ignore", "pipe", "pipe"],
        });

        let stdout = "";
        child.stdout.on("data", chunk => {
            stdout += chunk;
        });
        child.stderr.on("data", () => {});
        child.on("error", () => resolve({ok: false, stdout: ""}));
        child.on("close", code => resolve({ok: code === 0, stdout: stdout.trim()}));
    });
}

function sshKeyBlob(publicKeyLine) {
    const [, blob = ""] = String(publicKeyLine).trim().split(/\s+/);
    return blob;
}

/**
 * Fails fast when git is configured to sign commits with an SSH key that
 * cannot be used without a passphrase prompt.
 *
 * A blocked signer makes `git subtree` hang silently part way through a long
 * import, so this is checked before any expensive work starts.
 */
export async function ensureCommitSigningReady() {
    const signEnabled = await runCapture("git", ["config", "--get", "commit.gpgsign"], {
        cwd: projectRoot,
    });

    if (!signEnabled.ok || signEnabled.stdout !== "true") return;

    const format = await runCapture("git", ["config", "--get", "gpg.format"], {
        cwd: projectRoot,
    });

    // Only the SSH signer is checked here. GPG agents handle their own caching
    // and prompting, so probing them is not reliable enough to gate on.
    if (format.stdout !== "ssh") return;

    const signingKey = await runCapture("git", ["config", "--get", "user.signingkey"], {
        cwd: projectRoot,
    });

    if (!signingKey.ok || !signingKey.stdout) return;

    const configuredKey = signingKey.stdout;
    const agentKeys = await runCapture("ssh-add", ["-L"]);
    const loadedBlobs = new Set(
        agentKeys.stdout.split("\n").map(sshKeyBlob).filter(Boolean)
    );

    // A literal public key in user.signingkey can only be satisfied by the agent.
    if (/^(ssh|ecdsa|sk-)/.test(configuredKey)) {
        if (loadedBlobs.has(sshKeyBlob(configuredKey))) return;

        throw new Error(
            "Commit signing is configured with an SSH key that is not loaded in ssh-agent.\n" +
                "Run `ssh-add` for that key, or set CYBERCHEF_SKIP_SIGNING_CHECK=1 to bypass this check."
        );
    }

    const keyPath = configuredKey.replace(/^~(?=\/|$)/, os.homedir());

    // An unencrypted key file signs without prompting.
    const unencrypted = await runCapture("ssh-keygen", ["-y", "-P", "", "-f", keyPath]);
    if (unencrypted.ok) return;

    const publicKey = await fs.readFile(`${keyPath}.pub`, "utf8").catch(() => "");
    if (publicKey && loadedBlobs.has(sshKeyBlob(publicKey))) return;

    throw new Error(
        `Commit signing key ${keyPath} is passphrase protected and is not loaded in ssh-agent.\n` +
            `Signing would block partway through the import. Run \`ssh-add ${keyPath}\` first, ` +
            "or set CYBERCHEF_SKIP_SIGNING_CHECK=1 to bypass this check."
    );
}

function parseSemverTag(tag) {
    const match = tag.match(/^v?(\d+)\.(\d+)\.(\d+)$/);
    if (!match) return null;

    return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
        tag: tag.startsWith("v") ? tag : `v${tag}`,
    };
}

function compareSemverTags(left, right) {
    if (left.major !== right.major) return left.major - right.major;
    if (left.minor !== right.minor) return left.minor - right.minor;
    return left.patch - right.patch;
}

/**
 * Resolves the highest upstream release tag.
 *
 * Vendor updates track tagged CyberChef releases, so update detection has to
 * resolve the same thing. Comparing against a branch head instead would report
 * the vendored tree as stale for every commit landed after a release.
 */
export async function resolveLatestUpstreamTag(remoteUrl) {
    const {stdout} = await runCapture("git", ["ls-remote", "--tags", "--refs", remoteUrl], {
        cwd: projectRoot,
    });

    const tags = stdout
        .split("\n")
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => line.split(/\s+/)[1] || "")
        .filter(ref => ref.startsWith("refs/tags/v"))
        .map(ref => ref.replace("refs/tags/", ""))
        .map(parseSemverTag)
        .filter(Boolean)
        .sort(compareSemverTags);

    if (!tags.length) {
        throw new Error(`Unable to resolve upstream version tags from ${remoteUrl}`);
    }

    return tags[tags.length - 1].tag;
}
