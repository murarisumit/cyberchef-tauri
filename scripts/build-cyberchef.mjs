import process from "node:process";
import {runInCyberChefShell, stageCyberChefBuild} from "./lib.mjs";

try {
    await runInCyberChefShell(
        "npx grunt clean:prod clean:config exec:generateConfig findModules webpack:web"
    );
    await stageCyberChefBuild();
} catch (error) {
    console.error(error.message);
    process.exit(1);
}
