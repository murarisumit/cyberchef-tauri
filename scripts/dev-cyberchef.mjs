import process from "node:process";
import {runInCyberChefShell, syncDevWrapperAssets} from "./lib.mjs";

try {
    const port = process.env.CYBERCHEF_DEV_PORT || "8080";
    await syncDevWrapperAssets();
    await runInCyberChefShell(`npm run start -- --port=${port}`);
} catch (error) {
    console.error(error.message);
    process.exit(1);
}
