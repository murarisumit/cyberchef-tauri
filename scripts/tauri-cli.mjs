import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import {execFile, spawn} from "node:child_process";
import {promisify} from "node:util";
import {projectRoot} from "./lib.mjs";

const execFileAsync = promisify(execFile);

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

async function cleanupMountedCyberChefVolume() {
    if (process.platform !== "darwin") return;

    try {
        await fs.access("/Volumes/CyberChef");
    } catch {
        return;
    }

    const detachArgs = [
        ["detach", "/Volumes/CyberChef"],
        ["detach", "-force", "/Volumes/CyberChef"],
    ];

    for (const args of detachArgs) {
        try {
            await execFileAsync("hdiutil", args);
            return;
        } catch {
            // Try the next detach strategy.
        }
    }

    throw new Error("Unable to detach existing /Volumes/CyberChef mount before build");
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
        if (args[0] === "build") {
            await cleanupMountedCyberChefVolume();
        }

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
