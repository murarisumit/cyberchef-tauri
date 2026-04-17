import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {
    projectRoot,
    vendorMetadataPath,
    vendoredCyberChefDir,
} from "./lib.mjs";

const execFileAsync = promisify(execFile);

function parseArgs(argv) {
    const options = {
        includeNodeModules: false,
        source: process.env.CYBERCHEF_IMPORT_DIR || "../cyberchef",
    };

    for (let index = 0; index < argv.length; index += 1) {
        const value = argv[index];

        if (value === "--include-node-modules") {
            options.includeNodeModules = true;
            continue;
        }

        if (value === "--source") {
            options.source = argv[index + 1];
            index += 1;
        }
    }

    return options;
}

async function pathExists(targetPath) {
    try {
        await fs.access(targetPath);
        return true;
    } catch {
        return false;
    }
}

async function readPackageVersion(cyberChefDir) {
    const packageJson = JSON.parse(
        await fs.readFile(path.join(cyberChefDir, "package.json"), "utf8")
    );

    return packageJson.version || "unknown";
}

async function readGitValue(args, cwd) {
    try {
        const {stdout} = await execFileAsync("git", args, {cwd});
        return stdout.trim() || null;
    } catch {
        return null;
    }
}

async function copyVendoredSource(sourceDir, includeNodeModules) {
    const excludedNames = new Set([
        ".git",
        ".github",
        "build",
    ]);

    if (!includeNodeModules) excludedNames.add("node_modules");

    await fs.rm(vendoredCyberChefDir, {recursive: true, force: true});
    await fs.mkdir(path.dirname(vendoredCyberChefDir), {recursive: true});

    await fs.cp(sourceDir, vendoredCyberChefDir, {
        recursive: true,
        filter: sourcePath => !excludedNames.has(path.basename(sourcePath)),
    });
}

async function writeVendorMetadata(sourceDir, version) {
    const commit = await readGitValue(["rev-parse", "HEAD"], sourceDir);
    const remote = await readGitValue(["remote", "get-url", "origin"], sourceDir);

    const metadata = {
        importedAt: new Date().toISOString(),
        sourcePath: path.relative(projectRoot, sourceDir) || ".",
        version,
        commit,
        remote,
    };

    await fs.writeFile(`${vendorMetadataPath}`, `${JSON.stringify(metadata, null, 2)}\n`);
}

try {
    const options = parseArgs(process.argv.slice(2));
    const sourceDir = path.resolve(projectRoot, options.source);
    const requiredPaths = [
        path.join(sourceDir, "package.json"),
        path.join(sourceDir, "Gruntfile.js"),
    ];

    for (const requiredPath of requiredPaths) {
        if (!(await pathExists(requiredPath))) {
            throw new Error(`CyberChef checkout not found at ${sourceDir}`);
        }
    }

    const version = await readPackageVersion(sourceDir);
    await copyVendoredSource(sourceDir, options.includeNodeModules);
    await writeVendorMetadata(sourceDir, version);

    console.log(`Vendored CyberChef ${version} into ${vendoredCyberChefDir}`);
    if (!options.includeNodeModules) {
        console.log("Dependencies were not copied. Run npm run prepare:cyberchef next.");
    }
} catch (error) {
    console.error(error.message);
    process.exit(1);
}
