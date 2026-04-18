import process from "node:process";
import fs from "node:fs/promises";
import {readReleaseMetadata} from "./release-info.mjs";

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
        `release_asset_name=${metadata.releaseAssetName}`,
        `release_download_url=${metadata.releaseDownloadUrl}`,
        `source_repository=${metadata.sourceRepository}`,
        `source_repository_url=${metadata.sourceRepositoryUrl}`,
        `homebrew_version=${metadata.homebrewVersion}`,
        `homebrew_cask_token=${metadata.homebrewCaskToken}`,
        `homebrew_cask_path=${metadata.homebrewCaskPath}`,
        `homebrew_tap_name=${metadata.homebrewTapName}`,
        `homebrew_tap_repo=${metadata.homebrewTapRepo}`,
        `vendor_commit=${metadata.vendorCommit}`,
        `vendor_remote=${metadata.vendorRemote}`,
    ];

    return fs.appendFile(githubOutput, `${lines.join("\n")}\n`);
}

try {
    const metadata = await readReleaseMetadata();

    if (process.argv.includes("--github-output")) {
        await printGithubOutput(metadata);
    } else {
        console.log(JSON.stringify(metadata, null, 2));
    }
} catch (error) {
    console.error(error.message);
    process.exit(1);
}
