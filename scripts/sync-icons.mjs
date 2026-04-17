import process from "node:process";
import {resolveCyberChefDir, runBash} from "./lib.mjs";

try {
    const cyberChefDir = await resolveCyberChefDir();
    const sourcePng = `${cyberChefDir}/src/web/static/images/cyberchef-512x512.png`;

    await runBash(
        [
            "set -euo pipefail",
            `sips -z 1024 1024 ${JSON.stringify(sourcePng)} --out /tmp/cyberchef-wrapper-1024.png >/dev/null`,
            "npx tauri icon /tmp/cyberchef-wrapper-1024.png -o src-tauri/icons",
            "rm -f /tmp/cyberchef-wrapper-1024.png",
        ].join(" && ")
    );
} catch (error) {
    console.error(error.message);
    process.exit(1);
}

