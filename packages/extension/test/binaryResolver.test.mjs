import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import {
    enforceExecutablePermissions,
    getBinaryFileName,
    getPlatformArchKey,
    resolveBinary,
} from "../dist/daemon/BinaryResolver.js";

test("getPlatformArchKey generates normalized platform-architecture string", () => {
    assert.equal(getPlatformArchKey("win32", "x64"), "win32-x64");
    assert.equal(getPlatformArchKey("linux", "x64"), "linux-x64");
    assert.equal(getPlatformArchKey("darwin", "arm64"), "darwin-arm64");
    assert.equal(getPlatformArchKey("darwin", "x64"), "darwin-x64");
    assert.equal(getPlatformArchKey("linux", "ia32"), "linux-x86");
});

test("getBinaryFileName appends .exe on Windows and bare name on Unix", () => {
    assert.equal(getBinaryFileName("rux-daemon", "win32"), "rux-daemon.exe");
    assert.equal(getBinaryFileName("rux-daemon", "linux"), "rux-daemon");
    assert.equal(getBinaryFileName("rux-daemon", "darwin"), "rux-daemon");
    assert.equal(getBinaryFileName("rux-sync-server", "win32"), "rux-sync-server.exe");
    assert.equal(getBinaryFileName("rux-sync-server", "darwin"), "rux-sync-server");
});

test("resolveBinary respects customConfigPath override if file exists", () => {
    const customPath = path.join("/opt", "custom", "rux-daemon");
    const resolved = resolveBinary("rux-daemon", {
        platform: "linux",
        arch: "x64",
        customConfigPath: customPath,
        fileChecker: (p) => p === customPath,
    });
    assert.equal(resolved, customPath);
});

test("resolveBinary resolves Windows x64 packaged binary path", () => {
    const extPath = path.join("C:", "extensions", "ruxel-studio");
    const expected = path.join(extPath, "bin", "win32-x64", "rux-daemon.exe");

    const resolved = resolveBinary("rux-daemon", {
        platform: "win32",
        arch: "x64",
        extensionPath: extPath,
        fileChecker: (p) => p === expected,
    });

    assert.equal(resolved, expected);
});

test("resolveBinary resolves Linux x64 packaged binary path", () => {
    const extPath = "/home/user/.vscode/extensions/ruxel-studio";
    const expected = path.join(extPath, "bin", "linux-x64", "rux-daemon");

    const resolved = resolveBinary("rux-daemon", {
        platform: "linux",
        arch: "x64",
        extensionPath: extPath,
        fileChecker: (p) => p === expected,
    });

    assert.equal(resolved, expected);
});

test("resolveBinary resolves macOS Apple Silicon arm64 packaged binary path", () => {
    const extPath = "/Users/developer/.vscode/extensions/ruxel-studio";
    const expected = path.join(extPath, "bin", "darwin-arm64", "rux-daemon");

    const resolved = resolveBinary("rux-daemon", {
        platform: "darwin",
        arch: "arm64",
        extensionPath: extPath,
        fileChecker: (p) => p === expected,
    });

    assert.equal(resolved, expected);
});

test("resolveBinary resolves macOS Intel x64 packaged binary path", () => {
    const extPath = "/Users/developer/.vscode/extensions/ruxel-studio";
    const expected = path.join(extPath, "bin", "darwin-x64", "rux-daemon");

    const resolved = resolveBinary("rux-daemon", {
        platform: "darwin",
        arch: "x64",
        extensionPath: extPath,
        fileChecker: (p) => p === expected,
    });

    assert.equal(resolved, expected);
});

test("resolveBinary resolves rux-sync-server binary across platforms", () => {
    const winExt = path.join("C:", "ext");
    const winExpected = path.join(winExt, "bin", "win32-x64", "rux-sync-server.exe");
    const winResolved = resolveBinary("rux-sync-server", {
        platform: "win32",
        arch: "x64",
        extensionPath: winExt,
        fileChecker: (p) => p === winExpected,
    });
    assert.equal(winResolved, winExpected);

    const macExt = "/Users/dev/ext";
    const macExpected = path.join(macExt, "bin", "darwin-arm64", "rux-sync-server");
    const macResolved = resolveBinary("rux-sync-server", {
        platform: "darwin",
        arch: "arm64",
        extensionPath: macExt,
        fileChecker: (p) => p === macExpected,
    });
    assert.equal(macResolved, macExpected);
});

test("resolveBinary prefers workspace target/release in local development", () => {
    const ws = path.join("C:", "projects", "ruxel-studio");
    const releaseBin = path.join(ws, "target", "release", "rux-daemon.exe");
    const debugBin = path.join(ws, "target", "debug", "rux-daemon.exe");

    const resolved = resolveBinary("rux-daemon", {
        platform: "win32",
        arch: "x64",
        workspaceFolders: [ws],
        fileChecker: (p) => p === releaseBin || p === debugBin,
    });

    assert.equal(resolved, releaseBin);
});

test("resolveBinary falls back to target/debug when release does not exist", () => {
    const ws = "/home/developer/ruxel-studio";
    const debugBin = path.join(ws, "target", "debug", "rux-daemon");

    const resolved = resolveBinary("rux-daemon", {
        platform: "linux",
        arch: "x64",
        workspaceFolders: [ws],
        fileChecker: (p) => p === debugBin,
    });

    assert.equal(resolved, debugBin);
});

test("enforceExecutablePermissions sets mode on Unix systems", () => {
    let invokedPath = null;
    let invokedMode = null;

    const target = "/home/user/rux-daemon";
    enforceExecutablePermissions(
        target,
        "linux",
        () => true,
        (filePath, mode) => {
            invokedPath = filePath;
            invokedMode = mode;
        }
    );

    assert.equal(invokedPath, target);
    assert.equal(invokedMode, 0o755);
});

test("enforceExecutablePermissions is a no-op on Windows", () => {
    let invoked = false;
    enforceExecutablePermissions(
        "C:\\rux-daemon.exe",
        "win32",
        () => true,
        () => {
            invoked = true;
        }
    );
    assert.equal(invoked, false);
});
