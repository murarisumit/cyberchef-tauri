import fs from "node:fs/promises";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import process from "node:process";
import {projectRoot, vendorMetadataPath} from "./lib.mjs";

const execFileAsync = promisify(execFile);
const remoteName = process.env.CYBERCHEF_SUBTREE_REMOTE || "cyberchef-upstream";
const fallbackRemoteUrl =
    process.env.CYBERCHEF_UPSTREAM_URL || "https://github.com/gchq/CyberChef.git";
const configuredRef = process.env.CYBERCHEF_SUBTREE_REF || null;
const writeGithubOutput = process.argv.includes("--github-output");

async function runGit(args) {
    const {stdout} = await execFileAsync("git", args, {cwd: projectRoot});
    return stdout.trim();
}

async function readJsonFile(filePath) {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function resolveRemoteUrl() {
    try {
        return await runGit(["remote", "get-url", remoteName]);
    } catch {
        return fallbackRemoteUrl;
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

async function writeOutputs(outputs) {
    if (!writeGithubOutput || !process.env.GITHUB_OUTPUT) return;

    const content = Object.entries(outputs)
        .map(([key, value]) => `${key}=${value ?? ""}`)
        .join("\n");

    await fs.appendFile(process.env.GITHUB_OUTPUT, `${content}\n`);
}

try {
    const remoteUrl = await resolveRemoteUrl();
    const upstream = await resolveUpstreamTarget(remoteUrl);
    const vendorMetadata = await readJsonFile(vendorMetadataPath);
    const currentCommit = vendorMetadata.commit || "";
    const updated = upstream.commit !== currentCommit;

    await writeOutputs({
        updated: String(updated),
        current_commit: currentCommit,
        current_version: vendorMetadata.version || "",
        upstream_commit: upstream.commit,
        upstream_ref: upstream.ref,
        upstream_remote: remoteUrl,
    });

    console.log(
        updated
            ? `CyberChef upstream moved from ${currentCommit || "unknown"} to ${upstream.commit} on ${upstream.ref}.`
            : `CyberChef vendored source is current at ${upstream.commit} on ${upstream.ref}.`
    );
} catch (error) {
    console.error(error.message);
    process.exit(1);
}
