import * as fs from "fs";
import * as path from "path";
import type {
    ResolvedAssetItem,
    RuxDocument,
    WidgetNode,
} from "@ruxel/shared-types";

export interface AssetResolverOptions {
    readonly baseDir: string;
    readonly workspaceRoots: readonly string[];
    readonly toWebviewUri: (fsPath: string) => string;
    readonly fileExists?: (fsPath: string) => Promise<boolean>;
    readonly realpath?: (fsPath: string) => Promise<string>;
}

/**
 * Checks whether targetPath is strictly contained within any of the allowed workspace roots.
 * Prevents directory traversal attacks such as `../../../../etc/passwd` or `..\..\..\Windows\System32`.
 */
export function isPathContainedInRoots(
    targetPath: string,
    workspaceRoots: readonly string[]
): boolean {
    if (!targetPath || !workspaceRoots || workspaceRoots.length === 0) {
        return false;
    }

    const resolvedTarget = path.normalize(path.resolve(targetPath));
    const isWindows = process.platform === "win32";

    for (const root of workspaceRoots) {
        if (!root) continue;
        const resolvedRoot = path.normalize(path.resolve(root));

        if (isWindows) {
            const lowerTarget = resolvedTarget.toLowerCase();
            const lowerRoot = resolvedRoot.toLowerCase();
            if (lowerTarget === lowerRoot) {
                return true;
            }
            const rootWithSep = lowerRoot.endsWith(path.sep)
                ? lowerRoot
                : lowerRoot + path.sep;
            if (lowerTarget.startsWith(rootWithSep)) {
                return true;
            }
        } else {
            if (resolvedTarget === resolvedRoot) {
                return true;
            }
            const rootWithSep = resolvedRoot.endsWith(path.sep)
                ? resolvedRoot
                : resolvedRoot + path.sep;
            if (resolvedTarget.startsWith(rootWithSep)) {
                return true;
            }
        }
    }

    return false;
}

/**
 * Traverses a widget node tree recursively to collect all unique asset paths.
 */
export function collectAssetPathsFromNode(node?: WidgetNode | null): string[] {
    if (!node) {
        return [];
    }

    const collected = new Set<string>();

    function walk(n: WidgetNode) {
        if (n.properties?.image_path) {
            const p = n.properties.image_path.trim();
            if (p.length > 0) {
                collected.add(p);
            }
        }
        if (n.properties?.model_3d_path) {
            const p = n.properties.model_3d_path.trim();
            if (p.length > 0) {
                collected.add(p);
            }
        }
        if (n.children && Array.isArray(n.children)) {
            for (const child of n.children) {
                walk(child);
            }
        }
    }

    walk(node);
    return Array.from(collected);
}

const defaultFileExists = async (filePath: string): Promise<boolean> => {
    try {
        await fs.promises.access(filePath, fs.constants.R_OK);
        return true;
    } catch {
        return false;
    }
};

const defaultRealpath = async (filePath: string): Promise<string> => {
    try {
        return await fs.promises.realpath(filePath);
    } catch {
        return path.resolve(filePath);
    }
};

/**
 * Resolves a single asset path safely against the active workspace boundary.
 */
export async function resolveAssetPath(
    rawPath: string,
    options: AssetResolverOptions
): Promise<ResolvedAssetItem> {
    if (!rawPath || rawPath.trim().length === 0) {
        return {
            originalPath: rawPath,
            webviewUri: "",
            exists: false,
        };
    }

    const trimmed = rawPath.trim();

    // Already a web/data/webview URI
    if (/^(https?|data|vscode-webview-resource):/i.test(trimmed)) {
        return {
            originalPath: rawPath,
            webviewUri: trimmed,
            exists: true,
        };
    }

    const fileExistsFn = options.fileExists ?? defaultFileExists;
    const realpathFn = options.realpath ?? defaultRealpath;

    // Determine candidate paths on disk
    let candidatePath: string;
    if (path.isAbsolute(trimmed)) {
        candidatePath = path.normalize(path.resolve(trimmed));
    } else {
        // Try relative to baseDir (document directory)
        const docCandidate = path.normalize(path.resolve(options.baseDir, trimmed));
        
        // Try relative to workspace root if different
        let wsCandidate: string | null = null;
        if (options.workspaceRoots.length > 0) {
            wsCandidate = path.normalize(path.resolve(options.workspaceRoots[0], trimmed));
        }

        if (wsCandidate && wsCandidate !== docCandidate) {
            const docExists = await fileExistsFn(docCandidate);
            if (docExists) {
                candidatePath = docCandidate;
            } else {
                const wsExists = await fileExistsFn(wsCandidate);
                candidatePath = wsExists ? wsCandidate : docCandidate;
            }
        } else {
            candidatePath = docCandidate;
        }
    }

    // 1. Strict Boundary Check: Check before following symlinks
    if (!isPathContainedInRoots(candidatePath, options.workspaceRoots)) {
        return {
            originalPath: rawPath,
            webviewUri: "",
            exists: false,
        };
    }

    // 2. Symlink Traversal Check: Verify the real target also remains inside boundary
    const realTarget = await realpathFn(candidatePath);
    if (!isPathContainedInRoots(realTarget, options.workspaceRoots)) {
        return {
            originalPath: rawPath,
            webviewUri: "",
            exists: false,
        };
    }

    // 3. Existence verification
    const exists = await fileExistsFn(candidatePath);

    // 4. Generate safe webview URI
    const webviewUri = options.toWebviewUri(candidatePath);

    return {
        originalPath: rawPath,
        webviewUri,
        exists,
    };
}

/**
 * Asynchronously resolves all assets within a RuxDocument AST.
 */
export async function resolveAstAssets(
    document: RuxDocument | null,
    options: AssetResolverOptions
): Promise<Record<string, ResolvedAssetItem>> {
    if (!document?.root) {
        return {};
    }

    const paths = collectAssetPathsFromNode(document.root);
    const assetMap: Record<string, ResolvedAssetItem> = {};

    await Promise.all(
        paths.map(async (rawPath) => {
            const resolved = await resolveAssetPath(rawPath, options);
            assetMap[rawPath] = resolved;
        })
    );

    return assetMap;
}
