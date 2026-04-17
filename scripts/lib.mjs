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
export const vendorMetadataPath = path.join(projectRoot, "vendor", "cyberchef.vendor.json");
export const wrapperAssetsDir = path.join(projectRoot, "wrapper-assets");
const currentNodeBinDir = path.dirname(process.execPath);

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
    const sourceFontOverridePath = path.join(wrapperAssetsDir, "tauri-font-override.css");
    const sourceDesktopBridgePath = path.join(wrapperAssetsDir, "tauri-desktop.js");
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
    await fs.writeFile(stagedIndexPath, updatedIndexHtml);
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

export async function runBash(command, cwd = projectRoot) {
    const env = {
        ...process.env,
        NODE: process.execPath,
        PATH: `${currentNodeBinDir}${path.delimiter}${process.env.PATH || ""}`,
    };

    await new Promise((resolve, reject) => {
        const child = spawn("bash", ["-c", command], {
            cwd,
            env,
            stdio: "inherit",
        });

        child.on("exit", code => {
            if (code === 0) resolve();
            else reject(new Error(`Command failed with exit code ${code}: ${command}`));
        });

        child.on("error", reject);
    });
}

export async function runInCyberChefShell(command) {
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
        steps.push("nvm use >/dev/null");
    }

    steps.push(command);

    await runBash(steps.join(" && "));
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
