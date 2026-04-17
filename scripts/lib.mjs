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
    await new Promise((resolve, reject) => {
        const child = spawn("bash", ["-lc", command], {
            cwd,
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
    const nvmrcPath = path.join(cyberChefDir, ".nvmrc");
    const hasNvmrc = await pathExists(nvmrcPath);

    const steps = [`cd ${shellEscape(cyberChefDir)}`];

    if (hasNvmrc && nvmScript) {
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
