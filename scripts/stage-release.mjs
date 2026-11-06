import * as child_process from "child_process";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const rootDir = path.resolve(dirname, "..");
const extensionDir = path.join(rootDir, "packages", "extension");
const webviewDir = path.join(rootDir, "packages", "webview");
const sharedTypesDir = path.join(rootDir, "packages", "shared-types");
const extensionBinDir = path.join(extensionDir, "bin");
const isLocal = process.argv.includes("--local");

function runCommand(command, args, cwd) {
    const cmdLine = `${command} ${args.join(" ")}`;
    const result = child_process.spawnSync(cmdLine, {
        cwd,
        stdio: "inherit",
        shell: true,
    });
    if (result.status !== 0) {
        throw new Error(`Command failed: ${cmdLine} (exit code: ${result.status})`);
    }
}

function copyDirectoryRecursive(source, target) {
    if (!fs.existsSync(source)) {
        return;
    }
    fs.mkdirSync(target, { recursive: true });
    const entries = fs.readdirSync(source, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(source, entry.name);
        const dstPath = path.join(target, entry.name);
        if (entry.isDirectory()) {
            copyDirectoryRecursive(srcPath, dstPath);
        } else {
            fs.copyFileSync(srcPath, dstPath);
        }
    }
}

function getHostPlatformArchKey() {
    const platform = process.platform;
    const arch = process.arch === "ia32" ? "x86" : process.arch;
    return `${platform}-${arch}`;
}

function enforceExecutablePermissions(dir) {
    if (process.platform === "win32" || !fs.existsSync(dir)) {
        return;
    }
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            enforceExecutablePermissions(fullPath);
        } else {
            try {
                fs.chmodSync(fullPath, 0o755);
            } catch {
                continue;
            }
        }
    }
}

console.log("=== Ruxel Studio: Staging Production Extension ===");

console.log("Compiling @ruxel/shared-types...");
runCommand("npm", ["run", "build"], sharedTypesDir);

console.log("Compiling @ruxel/webview...");
runCommand("npm", ["run", "build"], webviewDir);

console.log("Compiling @ruxel/extension...");
runCommand("npm", ["run", "build"], extensionDir);

const webviewDist = path.join(webviewDir, "dist");
const stagedWebviewDist = path.join(extensionDir, "webview-dist");
const stagedWebviewLegacy = path.join(extensionDir, "dist", "webview");
if (fs.existsSync(webviewDist)) {
    console.log(`Copying webview dist to ${stagedWebviewDist}...`);
    copyDirectoryRecursive(webviewDist, stagedWebviewDist);
    copyDirectoryRecursive(webviewDist, stagedWebviewLegacy);
}

const licenseFiles = ["LICENSE-MIT", "LICENSE-APACHE", "LICENSE.md"];
for (const license of licenseFiles) {
    const src = path.join(rootDir, license);
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(extensionDir, license));
    }
}

fs.mkdirSync(extensionBinDir, { recursive: true });

const artifactsDir = path.join(rootDir, "artifacts");
if (fs.existsSync(artifactsDir)) {
    console.log("Importing CI matrix binary artifacts...");
    const artifactFolders = fs.readdirSync(artifactsDir, { withFileTypes: true });
    for (const folder of artifactFolders) {
        if (folder.isDirectory()) {
            const folderName = folder.name.replace(/^bin-/, "");
            const srcFolder = path.join(artifactsDir, folder.name);
            const dstFolder = path.join(extensionBinDir, folderName);
            copyDirectoryRecursive(srcFolder, dstFolder);
        }
    }
}

const targetRelease = path.join(rootDir, "target", "release");
if (fs.existsSync(targetRelease)) {
    const hostKey = getHostPlatformArchKey();
    const hostBinDir = path.join(extensionBinDir, hostKey);
    fs.mkdirSync(hostBinDir, { recursive: true });

    const binaryNames = process.platform === "win32"
        ? ["rux-daemon.exe", "rux-sync-server.exe"]
        : ["rux-daemon", "rux-sync-server"];

    for (const binName of binaryNames) {
        const srcBin = path.join(targetRelease, binName);
        if (fs.existsSync(srcBin)) {
            const targetArchPath = path.join(hostBinDir, binName);
            const targetFlatPath = path.join(extensionBinDir, binName);
            fs.copyFileSync(srcBin, targetArchPath);
            fs.copyFileSync(srcBin, targetFlatPath);
            console.log(`Staged binary: ${targetArchPath}`);
        }
    }
}

enforceExecutablePermissions(extensionBinDir);

const requiredChecks = [
    path.join(extensionDir, "package.json"),
    path.join(extensionDir, "README.md"),
    path.join(extensionDir, "dist", "extension.js"),
    path.join(extensionDir, "webview-dist", "index.html"),
    path.join(extensionDir, "dist", "webview", "index.html"),
    path.join(extensionDir, "assets", "icon.png"),
];

for (const check of requiredChecks) {
    if (!fs.existsSync(check)) {
        throw new Error(`Release staging failed: missing required file ${check}`);
    }
}

console.log("=== Extension staging completed successfully ===");
