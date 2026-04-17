import process from "node:process";
import {runInCyberChefShell} from "./lib.mjs";

try {
    await runInCyberChefShell("npm install");
} catch (error) {
    console.error(error.message);
    process.exit(1);
}
