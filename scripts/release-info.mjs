import fs from "node:fs/promises";
import path from "node:path";
import {
    buildReleaseAssetName,
    buildReleaseDownloadUrl,
    buildReleaseTag,
    githubRepo,
    githubRepoUrl,
    homebrewCaskPath,
    homebrewCaskToken,
    homebrewTapName,
    homebrewTapRepo,
    projectRoot,
    vendorMetadataPath,
    vendoredCyberChefDir,
} from "./lib.mjs";

async function readJsonFile(filePath) {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
}

export function buildReleaseMetadata({appVersion, cyberChefVersion, vendorMetadata}) {
    const releaseTag = buildReleaseTag(appVersion, cyberChefVersion);

    return {
        appVersion,
        cyberChefVersion,
        homebrewVersion: releaseTag.slice(1),
        releaseTag,
        releaseName: `CyberChef Tauri ${releaseTag}`,
        releaseAssetName: buildReleaseAssetName(releaseTag),
        releaseDownloadUrl: buildReleaseDownloadUrl(releaseTag),
        sourceRepository: githubRepo,
        sourceRepositoryUrl: githubRepoUrl,
        homebrewCaskToken,
        homebrewCaskPath,
        homebrewTapName,
        homebrewTapRepo,
        vendorCommit: vendorMetadata.commit || "",
        vendorRemote: vendorMetadata.remote || "",
    };
}

export async function readReleaseMetadata() {
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

    return buildReleaseMetadata({
        appVersion,
        cyberChefVersion,
        vendorMetadata,
    });
}
