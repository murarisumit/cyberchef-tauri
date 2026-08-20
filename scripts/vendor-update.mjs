import path from "node:path";
import process from "node:process";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {cyberChefMirrorBranch, projectRoot, resolveLatestUpstreamTag} from "./lib.mjs";

const execFileAsync = promisify(execFile);
const defaultRemoteUrl =
    process.env.CYBERCHEF_UPSTREAM_URL || "https://github.com/gchq/CyberChef.git";

function parseArgs(argv) {
    const options = {
        buildWeb: false,
        ref: null,
        source: null,
        version: null,
    };

    for (let index = 0; index < argv.length; index += 1) {
        const value = argv[index];

        if (value === "--build-web") {
            options.buildWeb = true;
            continue;
        }

        if (value === "--ref") {
            options.ref = argv[index + 1] || null;
            index += 1;
            continue;
        }

        if (value === "--source") {
            options.source = argv[index + 1] || null;
            index += 1;
            continue;
        }

        if (!options.version) {
            options.version = value;
            continue;
        }

        throw new Error(`Unknown argument: ${value}`);
    }

    return options;
}

function normalizeTag(version) {
    if (!version || version === "latest") return null;
    return version.startsWith("v") ? version : `v${version}`;
}

async function runGit(args, cwd = projectRoot) {
    const {stdout} = await execFileAsync("git", args, {cwd});
    return stdout.trim();
}

async function hasSubtreeHistory() {
    const output = await runGit([
        "log",
        "--grep",
        "git-subtree-dir: vendor/cyberchef",
        "--format=%H",
        "-n",
        "1",
    ]);

    return Boolean(output);
}

async function runNodeScript(scriptPath, args = [], env = {}) {
    await new Promise((resolve, reject) => {
        const child = execFile(
            process.execPath,
            [scriptPath, ...args],
            {
                cwd: projectRoot,
                env: {
                    ...process.env,
                    ...env,
                },
                stdio: "inherit",
            },
            error => {
                if (error) reject(error);
                else resolve();
            }
        );

        child.stdout?.pipe(process.stdout);
        child.stderr?.pipe(process.stderr);
    });
}

try {
    const options = parseArgs(process.argv.slice(2));
    const resolvedRef =
        options.ref || normalizeTag(options.version) || await resolveLatestUpstreamTag(defaultRemoteUrl);

    if (options.source) {
        throw new Error(
            "--source is not supported in the mirror-branch workflow. Use vendor:cyberchef only as a one-off recovery path."
        );
    }

    const subtreeMode = await hasSubtreeHistory() ? "pull" : "add";

    await runNodeScript(path.join(projectRoot, "scripts", "vendor-subtree.mjs"), [
        subtreeMode,
    ], {
        CYBERCHEF_SUBTREE_REF: resolvedRef,
        CYBERCHEF_UPSTREAM_URL: defaultRemoteUrl,
        CYBERCHEF_MIRROR_BRANCH: cyberChefMirrorBranch,
    });

    await runNodeScript(path.join(projectRoot, "scripts", "prepare-cyberchef.mjs"));
    await runNodeScript(path.join(projectRoot, "scripts", "release-check.mjs"));

    if (options.buildWeb) {
        await runNodeScript(path.join(projectRoot, "scripts", "build-cyberchef.mjs"));
    }
} catch (error) {
    console.error(error.message);
    process.exit(1);
}