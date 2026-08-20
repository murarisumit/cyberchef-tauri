import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
    buildBundleVersion,
    infoPlistPath,
    projectRoot,
    readInfoPlistBundleVersion,
    vendorMetadataPath,
    vendoredCyberChefDir,
} from "./lib.mjs";

async function readJsonFile(filePath) {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
}

try {
    const packageJson = await readJsonFile(path.join(projectRoot, "package.json"));
    const tauriConfig = await readJsonFile(path.join(projectRoot, "src-tauri", "tauri.conf.json"));
    const cyberChefPackage = await readJsonFile(path.join(vendoredCyberChefDir, "package.json"));
    const vendorMetadata = await readJsonFile(vendorMetadataPath);
    const infoPlist = await fs.readFile(infoPlistPath, "utf8");

    const appVersion = packageJson.version;
    const tauriVersion = tauriConfig.package.version;
    const cyberChefVersion = cyberChefPackage.version;
    const metadataVersion = vendorMetadata.version;
    const expectedTag = `v${appVersion}-cyberchef.${cyberChefVersion}`;
    const actualTag = process.env.RELEASE_TAG || "";

    if (appVersion !== tauriVersion) {
        throw new Error(
            `App version mismatch: package.json=${appVersion}, tauri.conf.json=${tauriVersion}`
        );
    }

    if (metadataVersion !== cyberChefVersion) {
        throw new Error(
            `Vendor metadata mismatch: cyberchef.vendor.json=${metadataVersion}, vendor/cyberchef/package.json=${cyberChefVersion}`
        );
    }

    const bundleVersion = readInfoPlistBundleVersion(infoPlist);
    const expectedBundleVersion = buildBundleVersion(cyberChefVersion);

    if (bundleVersion !== expectedBundleVersion) {
        throw new Error(
            `About panel version mismatch: src-tauri/Info.plist CFBundleVersion=${bundleVersion}, ` +
            `expected ${expectedBundleVersion}. Run \`npm run vendor:update\` or fix it by hand.`
        );
    }

    if (!vendorMetadata.commit) {
        throw new Error("vendor/cyberchef.vendor.json is missing commit metadata");
    }

    if (!vendorMetadata.remote) {
        throw new Error("vendor/cyberchef.vendor.json is missing remote metadata");
    }

    if (actualTag && actualTag !== expectedTag) {
        throw new Error(`Release tag mismatch: expected ${expectedTag}, got ${actualTag}`);
    }

    console.log(`App version: ${appVersion}`);
    console.log(`CyberChef version: ${cyberChefVersion}`);
    console.log(`Expected release tag: ${expectedTag}`);
    console.log(`Vendored commit: ${vendorMetadata.commit}`);
    console.log(`About panel version: ${appVersion} (${bundleVersion})`);
} catch (error) {
    console.error(error.message);
    process.exit(1);
}
