import process from "node:process";
import {runInCyberChefShell, stageCyberChefBuild} from "./lib.mjs";

const suppressBuildNoisePatterns = [
    /^Webpack Bundle Analyzer saved report to /,
];

const suppressBuildNoiseBlocks = [
    {
        start: /^99% done plugins webpack-bundle-analyzerError parsing bundle asset /,
        end: /^\}$/,
    },
    {
        start: /^Error parsing bundle asset /,
        end: /^\}$/,
    },
];

try {
    await runInCyberChefShell(
        "npx grunt clean:prod clean:config exec:generateConfig findModules webpack:web",
        {
            suppressOutputBlocks: suppressBuildNoiseBlocks,
            suppressOutputPatterns: suppressBuildNoisePatterns,
        }
    );
    await stageCyberChefBuild();
} catch (error) {
    console.error(error.message);
    process.exit(1);
}
