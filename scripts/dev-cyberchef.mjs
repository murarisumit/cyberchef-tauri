import process from "node:process";
import {runInCyberChefShell} from "./lib.mjs";

try {
    await runInCyberChefShell("npm run start -- --port=8080");
} catch (error) {
    console.error(error.message);
    process.exit(1);
}

