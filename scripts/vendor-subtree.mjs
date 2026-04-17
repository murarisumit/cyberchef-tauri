import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {
    projectRoot,
    runBash,
    vendorMetadataPath,
    vendoredCyberChefDir,
} from "./lib.mjs";

const mode = process.argv[2];
const remote = process.env.CYBERCHEF_SUBTREE_REMOTE || "cyberchef-upstream";
const configuredRef = process.env.CYBERCHEF_SUBTREE_REF || null;
const fallbackRemoteUrl =
    process.env.CYBERCHEF_UPSTREAM_URL || "https://github.com/gchq/CyberChef.git";
const execFileAsync = promisify(execFile);

async function runGit(args) {
    const {stdout} = await execFileAsync("git", args, {cwd: projectRoot});
    return stdout.trim();
}

async function ensureRemote(remoteName, remoteUrl) {
    try {
        return await runGit(["remote", "get-url", remoteName]);
    } catch {
        await runGit(["remote", "add", remoteName, remoteUrl]);
        return remoteUrl;
    }
}

async function resolveUpstreamTarget(remoteUrl) {
    if (configuredRef) {
        const commitOutput = await runGit(["ls-remote", remoteUrl, configuredRef]);
        const [commit = ""] = commitOutput.split(/\s+/, 1);

        if (!commit) {
            throw new Error(`Unable to resolve upstream ref ${configuredRef} from ${remoteUrl}`);
        }

        return {
            ref: configuredRef,
            commit,
        };
    }

    const output = await runGit(["ls-remote", "--symref", remoteUrl, "HEAD"]);
    const lines = output.split("\n");
    const headRefLine = lines.find(line => line.startsWith("ref: "));
    const headCommitLine = lines.find(line => /\sHEAD$/.test(line));

    if (!headRefLine || !headCommitLine) {
        throw new Error(`Unable to resolve upstream HEAD from ${remoteUrl}`);
    }

    const refMatch = headRefLine.match(/^ref:\srefs\/heads\/([^\s]+)\sHEAD$/);
    const commitMatch = headCommitLine.match(/^([0-9a-f]+)\sHEAD$/);

    if (!refMatch || !commitMatch) {
        throw new Error(`Unable to parse upstream HEAD details from ${remoteUrl}`);
    }

    return {
        ref: refMatch[1],
        commit: commitMatch[1],
    };
}

async function writeVendorMetadata({ref, commit, remoteUrl}) {
    const packageJson = JSON.parse(
        await fs.readFile(path.join(vendoredCyberChefDir, "package.json"), "utf8")
    );

    const metadata = {
        importedAt: new Date().toISOString(),
        sourcePath: `git-subtree:${remote}/${ref}`,
        version: packageJson.version || "unknown",
        commit,
        remote: remoteUrl,
        ref,
    };

    await fs.writeFile(vendorMetadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
}

if (!["add", "pull"].includes(mode)) {
    console.error("Usage: node ./scripts/vendor-subtree.mjs <add|pull>");
    process.exit(1);
}

try {
    const remoteUrl = await ensureRemote(remote, fallbackRemoteUrl);
    const upstream = await resolveUpstreamTarget(remoteUrl);
    const command =
        mode === "add"
            ? `git subtree add --prefix=${JSON.stringify("vendor/cyberchef")} ${JSON.stringify(remote)} ${JSON.stringify(upstream.ref)} --squash`
            : `git subtree pull --prefix=${JSON.stringify("vendor/cyberchef")} ${JSON.stringify(remote)} ${JSON.stringify(upstream.ref)} --squash`;

    await runBash(command);
    await writeVendorMetadata({
        ref: upstream.ref,
        commit: upstream.commit,
        remoteUrl,
    });
    console.log(
        `${mode === "add" ? "Added" : "Updated"} vendored CyberChef at ${vendoredCyberChefDir}`
    );
} catch (error) {
    console.error(error.message);
    process.exit(1);
}
