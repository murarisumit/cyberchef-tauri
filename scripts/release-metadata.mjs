import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {projectRoot, vendorMetadataPath, vendoredCyberChefDir} from "./lib.mjs";

async function readJsonFile(filePath) {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function buildReleaseMetadata({appVersion, cyberChefVersion, vendorMetadata}) {
    const releaseTag = `v${appVersion}-cyberchef.${cyberChefVersion}`;

    return {
        appVersion,
        cyberChefVersion,
        releaseTag,
        releaseName: `CyberChef Tauri ${releaseTag}`,
        vendorCommit: vendorMetadata.commit || "",
        vendorRemote: vendorMetadata.remote || "",
    };
}

function printGithubOutput(metadata) {
    const githubOutput = process.env.GITHUB_OUTPUT;

    if (!githubOutput) {
        throw new Error("GITHUB_OUTPUT is not set");
    }

    const lines = [
        `app_version=${metadata.appVersion}`,
        `cyberchef_version=${metadata.cyberChefVersion}`,
        `release_tag=${metadata.releaseTag}`,
        `release_name=${metadata.releaseName}`,
        `vendor_commit=${metadata.vendorCommit}`,
        `vendor_remote=${metadata.vendorRemote}`,
    ];

    return fs.appendFile(githubOutput, `${lines.join("\n")}\n`);
}

try {
    const packageJson = await readJsonFile(path.join(projectRoot, "package.json"));
    const tauriConfig = await readJsonFile(path.join(projectRoot, "src-tauri", "tauri.conf.json"));
    const cyberChefPackage = await readJsonFile(path.join(vendoredCyberChefDir, "package.json"));
    const vendorMetadata = await readJsonFile(vendorMetadataPath);

    const appVersion = packageJson.version;
    const tauriVersion = tauriConfig.package.version;
    const cyberChefVersion = cyberChefPackage.version;

    if (appVersion !== tauriVersion) {
        throw new Error(
            `App version mismatch: package.json=${appVersion}, tauri.conf.json=${tauriVersion}`
        );
    }

    const metadata = buildReleaseMetadata({
        appVersion,
        cyberChefVersion,
        vendorMetadata,
    });

    if (process.argv.includes("--github-output")) {
        await printGithubOutput(metadata);
    } else {
        console.log(JSON.stringify(metadata, null, 2));
    }
} catch (error) {
    console.error(error.message);
    process.exit(1);
}
