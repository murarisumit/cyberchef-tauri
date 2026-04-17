import process from "node:process";
import {runBash, vendoredCyberChefDir} from "./lib.mjs";

const mode = process.argv[2];
const remote = process.env.CYBERCHEF_SUBTREE_REMOTE || "cyberchef-upstream";
const ref = process.env.CYBERCHEF_SUBTREE_REF || "master";

if (!["add", "pull"].includes(mode)) {
    console.error("Usage: node ./scripts/vendor-subtree.mjs <add|pull>");
    process.exit(1);
}

const command =
    mode === "add"
        ? `git subtree add --prefix=${JSON.stringify("vendor/cyberchef")} ${JSON.stringify(remote)} ${JSON.stringify(ref)} --squash`
        : `git subtree pull --prefix=${JSON.stringify("vendor/cyberchef")} ${JSON.stringify(remote)} ${JSON.stringify(ref)} --squash`;

try {
    await runBash(command);
    console.log(
        `${mode === "add" ? "Added" : "Updated"} vendored CyberChef at ${vendoredCyberChefDir}`
    );
} catch (error) {
    console.error(error.message);
    process.exit(1);
}
