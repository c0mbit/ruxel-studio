import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import {
    collectAssetPathsFromNode,
    isPathContainedInRoots,
    resolveAssetPath,
    resolveAstAssets,
} from "../dist/editor/AssetResolver.js";

const isWindows = process.platform === "win32";
const mockWorkspaceRoot = isWindows
    ? "C:\\Users\\developer\\projects\\ruxel-app"
    : "/home/developer/projects/ruxel-app";
const mockBaseDir = isWindows
    ? "C:\\Users\\developer\\projects\\ruxel-app\\src"
    : "/home/developer/projects/ruxel-app/src";

function mockToWebviewUri(fsPath) {
    const normalized = fsPath.replace(/\\/g, "/");
    return `vscode-webview-resource://authority/${normalized.replace(/^([a-zA-Z]):/, "$1")}`;
}

test("isPathContainedInRoots: allows paths strictly inside workspace root", () => {
    const validPath1 = path.join(mockWorkspaceRoot, "assets", "logo.png");
    const validPath2 = path.join(mockBaseDir, "components", "icon.svg");

    assert.equal(isPathContainedInRoots(validPath1, [mockWorkspaceRoot]), true);
    assert.equal(isPathContainedInRoots(validPath2, [mockWorkspaceRoot]), true);
    assert.equal(isPathContainedInRoots(mockWorkspaceRoot, [mockWorkspaceRoot]), true);
});

test("isPathContainedInRoots: REJECTS directory traversal attacks", () => {
    // Escaping via ../
    const traversal1 = path.join(mockWorkspaceRoot, "..", "..", "..", "etc", "passwd");
    const traversal2 = path.join(mockBaseDir, "..", "..", "..", "etc", "shadow");
    const traversal3 = path.join(mockWorkspaceRoot, "assets", "..", "..", "..", "secret.env");

    assert.equal(isPathContainedInRoots(traversal1, [mockWorkspaceRoot]), false);
    assert.equal(isPathContainedInRoots(traversal2, [mockWorkspaceRoot]), false);
    assert.equal(isPathContainedInRoots(traversal3, [mockWorkspaceRoot]), false);

    // Absolute system paths
    const systemPath = isWindows ? "C:\\Windows\\System32\\cmd.exe" : "/etc/passwd";
    assert.equal(isPathContainedInRoots(systemPath, [mockWorkspaceRoot]), false);
});

test("isPathContainedInRoots: prevents sibling folder prefix attacks", () => {
    // Sibling folder sharing the same prefix name should NOT be considered inside root
    const siblingDir = isWindows
        ? "C:\\Users\\developer\\projects\\ruxel-app-attacker\\evil.png"
        : "/home/developer/projects/ruxel-app-attacker/evil.png";

    assert.equal(isPathContainedInRoots(siblingDir, [mockWorkspaceRoot]), false);
});

test("collectAssetPathsFromNode: extracts and de-duplicates image paths recursively", () => {
    const mockTree = {
        id: "root",
        widget_type: "v_box",
        properties: {},
        children: [
            {
                id: "img_1",
                widget_type: "image",
                properties: { image_path: "assets/logo.png" },
                children: [],
            },
            {
                id: "nested_vbox",
                widget_type: "v_box",
                properties: {},
                children: [
                    {
                        id: "img_2",
                        widget_type: "image",
                        properties: { image_path: "assets/banner.jpg" },
                        children: [],
                    },
                    {
                        id: "img_duplicate",
                        widget_type: "image",
                        properties: { image_path: "assets/logo.png" },
                        children: [],
                    },
                ],
            },
        ],
    };

    const collected = collectAssetPathsFromNode(mockTree);
    assert.equal(collected.length, 2);
    assert.ok(collected.includes("assets/logo.png"));
    assert.ok(collected.includes("assets/banner.jpg"));
});

test("resolveAssetPath: converts valid existing local path to webview URI", async () => {
    const existingFile = path.join(mockWorkspaceRoot, "assets", "logo.png");

    const result = await resolveAssetPath("assets/logo.png", {
        baseDir: mockBaseDir,
        workspaceRoots: [mockWorkspaceRoot],
        toWebviewUri: mockToWebviewUri,
        fileExists: async (p) => path.normalize(p) === path.normalize(existingFile),
        realpath: async (p) => p,
    });

    assert.equal(result.originalPath, "assets/logo.png");
    assert.equal(result.exists, true);
    assert.ok(result.webviewUri.startsWith("vscode-webview-resource://"));
    assert.ok(result.webviewUri.includes("assets/logo.png"));
});

test("resolveAssetPath: reports exists:false for missing file but still provides URI within bounds", async () => {
    const result = await resolveAssetPath("assets/missing.png", {
        baseDir: mockBaseDir,
        workspaceRoots: [mockWorkspaceRoot],
        toWebviewUri: mockToWebviewUri,
        fileExists: async () => false,
        realpath: async (p) => p,
    });

    assert.equal(result.originalPath, "assets/missing.png");
    assert.equal(result.exists, false);
    assert.ok(result.webviewUri.startsWith("vscode-webview-resource://"));
});

test("resolveAssetPath: BLOCKS traversal attempt and returns empty webviewUri", async () => {
    const traversalPath = "../../../../etc/passwd";

    const result = await resolveAssetPath(traversalPath, {
        baseDir: mockBaseDir,
        workspaceRoots: [mockWorkspaceRoot],
        toWebviewUri: mockToWebviewUri,
        fileExists: async () => true, // Even if attacker file existed
        realpath: async (p) => p,
    });

    assert.equal(result.originalPath, traversalPath);
    assert.equal(result.webviewUri, "");
    assert.equal(result.exists, false);
});

test("resolveAssetPath: BLOCKS symlink that escapes workspace boundary", async () => {
    const symlinkInside = path.join(mockWorkspaceRoot, "assets", "link.png");
    const escapedTarget = isWindows ? "C:\\secret\\file.png" : "/etc/passwd";

    const result = await resolveAssetPath("assets/link.png", {
        baseDir: mockBaseDir,
        workspaceRoots: [mockWorkspaceRoot],
        toWebviewUri: mockToWebviewUri,
        fileExists: async () => true,
        realpath: async () => escapedTarget, // Real target is outside workspace!
    });

    assert.equal(result.webviewUri, "");
    assert.equal(result.exists, false);
});

test("resolveAssetPath: passes through safe remote URLs and data URIs untouched", async () => {
    const httpsUrl = "https://example.com/logo.svg";
    const dataUri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA";

    const resHttps = await resolveAssetPath(httpsUrl, {
        baseDir: mockBaseDir,
        workspaceRoots: [mockWorkspaceRoot],
        toWebviewUri: mockToWebviewUri,
    });
    assert.equal(resHttps.webviewUri, httpsUrl);
    assert.equal(resHttps.exists, true);

    const resData = await resolveAssetPath(dataUri, {
        baseDir: mockBaseDir,
        workspaceRoots: [mockWorkspaceRoot],
        toWebviewUri: mockToWebviewUri,
    });
    assert.equal(resData.webviewUri, dataUri);
    assert.equal(resData.exists, true);
});

test("resolveAstAssets: processes entire document AST asynchronously", async () => {
    const mockDoc = {
        schema_version: "0.1.4",
        root: {
            id: "root",
            widget_type: "v_box",
            children: [
                {
                    id: "img_valid",
                    widget_type: "image",
                    properties: { image_path: "assets/logo.png" },
                },
                {
                    id: "img_traversal",
                    widget_type: "image",
                    properties: { image_path: "../../../etc/passwd" },
                },
            ],
        },
    };

    const map = await resolveAstAssets(mockDoc, {
        baseDir: mockBaseDir,
        workspaceRoots: [mockWorkspaceRoot],
        toWebviewUri: mockToWebviewUri,
        fileExists: async (p) => p.includes("logo.png"),
        realpath: async (p) => p,
    });

    assert.ok(map["assets/logo.png"]);
    assert.equal(map["assets/logo.png"].exists, true);
    assert.ok(map["assets/logo.png"].webviewUri.length > 0);

    assert.ok(map["../../../etc/passwd"]);
    assert.equal(map["../../../etc/passwd"].exists, false);
    assert.equal(map["../../../etc/passwd"].webviewUri, "");
});
