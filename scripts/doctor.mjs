import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
    detectInstalledNodeModules,
    resolveCyberChefDir,
    stagedDistDir,
    validateStagedDist,
    vendorMetadataPath,
    vendoredCyberChefDir,
} from "./lib.mjs";

try {
    let nvmrc = "not found";
    const cyberChefDir = await resolveCyberChefDir({optional: true});
    const hasNodeModules = await detectInstalledNodeModules();
    let vendorMetadataStatus = "not found";

    if (cyberChefDir) {
        const nvmrcPath = path.join(cyberChefDir, ".nvmrc");

        try {
            nvmrc = (await fs.readFile(nvmrcPath, "utf8")).trim();
        } catch {
            // Keep the default status.
        }
    }

    try {
        const rawMetadata = await fs.readFile(vendorMetadataPath, "utf8");
        const metadata = JSON.parse(rawMetadata);
        vendorMetadataStatus = `${metadata.version || "unknown version"} (${metadata.commit || "no commit"})`;
    } catch {
        // Keep the default status.
    }

    let stagedDistStatus = "ready";

    try {
        await validateStagedDist();
    } catch (error) {
        stagedDistStatus = error.message;
    }

    console.log(`Wrapper root: ${process.cwd()}`);
    console.log(`Vendored CyberChef dir: ${vendoredCyberChefDir}`);
    console.log(`Resolved CyberChef dir: ${cyberChefDir || "not found"}`);
    console.log(`CyberChef .nvmrc: ${nvmrc}`);
    console.log(`CyberChef node_modules: ${hasNodeModules ? "installed" : "missing"}`);
    console.log(`Vendor metadata: ${vendorMetadataStatus}`);
    console.log(`Staged dist dir: ${stagedDistDir}`);
    console.log(`Staged dist status: ${stagedDistStatus}`);
    console.log("Desktop build mode: vendored source checkout");
} catch (error) {
    console.error(error.message);
    process.exit(1);
}
