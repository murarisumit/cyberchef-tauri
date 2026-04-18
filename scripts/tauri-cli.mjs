import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import {spawn} from "node:child_process";
import {projectRoot} from "./lib.mjs";

const tauriBin = path.join(
    projectRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "tauri.cmd" : "tauri"
);
const tauriConfigPath = path.join(projectRoot, "src-tauri", "tauri.conf.json");

function spawnTauri(args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(tauriBin, args, {
            cwd: projectRoot,
            stdio: "inherit",
            env: {
                ...process.env,
                ...options.env,
            },
        });

        child.on("error", reject);
        child.on("exit", code => {
            if (code === 0) resolve();
            else reject(new Error(`tauri ${args.join(" ")} exited with code ${code}`));
        });
    });
}

function findAvailablePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();

        server.unref();
        server.on("error", reject);
        server.listen(0, "127.0.0.1", () => {
            const address = server.address();

            if (!address || typeof address === "string") {
                server.close(() => reject(new Error("Unable to resolve an available dev port.")));
                return;
            }

            const {port} = address;
            server.close(error => {
                if (error) reject(error);
                else resolve(port);
            });
        });
    });
}

async function createDevConfig(port) {
    const config = JSON.parse(await fs.readFile(tauriConfigPath, "utf8"));

    config.build = {
        ...config.build,
        devPath: `http://localhost:${port}/`,
    };

    const tempConfigPath = path.join(
        os.tmpdir(),
        `cyberchef-tauri-dev-${process.pid}-${port}.json`
    );

    await fs.writeFile(tempConfigPath, JSON.stringify(config, null, 2));
    return tempConfigPath;
}

async function run() {
    const args = process.argv.slice(2);

    if (args[0] !== "dev") {
        await spawnTauri(args);
        return;
    }

    const port = await findAvailablePort();
    const tempConfigPath = await createDevConfig(port);

    try {
        console.log(`Using CyberChef dev port ${port}`);
        await spawnTauri(["dev", "--config", tempConfigPath, ...args.slice(1)], {
            env: {
                CYBERCHEF_DEV_PORT: String(port),
            },
        });
    } finally {
        await fs.rm(tempConfigPath, {force: true});
    }
}

run().catch(error => {
    console.error(error.message);
    process.exit(1);
});
