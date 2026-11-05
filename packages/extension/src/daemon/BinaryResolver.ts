import * as fs from "fs";
import * as path from "path";

export interface BinaryResolverOptions {
    extensionPath?: string;
    workspaceFolders?: string[];
    platform?: string;
    arch?: string;
    customConfigPath?: string;
    envTargetDir?: string;
    homeDir?: string;
    fileChecker?: (filePath: string) => boolean;
    chmodRunner?: (filePath: string, mode: number) => void;
}

export function getPlatformArchKey(platform: string = process.platform, arch: string = process.arch): string {
    const normalizedArch = arch === "ia32" ? "x86" : arch;
    return `${platform}-${normalizedArch}`;
}

export function getBinaryFileName(baseName: string, platform: string = process.platform): string {
    return platform === "win32" ? `${baseName}.exe` : baseName;
}

export function enforceExecutablePermissions(
    targetPath: string,
    platform: string = process.platform,
    fileChecker: (p: string) => boolean = fs.existsSync,
    chmodRunner: (p: string, mode: number) => void = fs.chmodSync
): void {
    if (platform === "win32") {
        return;
    }
    if (!fileChecker(targetPath)) {
        return;
    }
    try {
        const stats = fs.statSync(targetPath);
        if ((stats.mode & 0o111) !== 0o111) {
            chmodRunner(targetPath, stats.mode | 0o755);
        }
    } catch {
        try {
            chmodRunner(targetPath, 0o755);
        } catch {
            return;
        }
    }
}

export function resolveBinary(
    baseName: string,
    options: BinaryResolverOptions = {}
): string | null {
    const platform = options.platform || process.platform;
    const arch = options.arch || process.arch;
    const fileChecker = options.fileChecker || fs.existsSync;
    const chmodRunner = options.chmodRunner || fs.chmodSync;

    const binaryFileName = getBinaryFileName(baseName, platform);
    const platformArch = getPlatformArchKey(platform, arch);

    if (options.customConfigPath && fileChecker(options.customConfigPath)) {
        enforceExecutablePermissions(options.customConfigPath, platform, fileChecker, chmodRunner);
        return options.customConfigPath;
    }

    const candidatePaths: string[] = [];

    if (options.extensionPath) {
        candidatePaths.push(
            path.join(options.extensionPath, "bin", platformArch, binaryFileName),
            path.join(options.extensionPath, "bin", binaryFileName)
        );
    }

    const envTarget = options.envTargetDir ?? process.env.CARGO_TARGET_DIR;
    if (envTarget) {
        candidatePaths.push(
            path.join(envTarget, "release", binaryFileName),
            path.join(envTarget, "debug", binaryFileName)
        );
    }

    const home = options.homeDir ?? (process.env.USERPROFILE || process.env.HOME || "");
    if (home) {
        candidatePaths.push(
            path.join(home, ".cargo", "ruxel-target", "release", binaryFileName),
            path.join(home, ".cargo", "ruxel-target", "debug", binaryFileName)
        );
    }

    if (options.workspaceFolders && options.workspaceFolders.length > 0) {
        for (const workspaceFolder of options.workspaceFolders) {
            candidatePaths.push(
                path.join(workspaceFolder, "target", "release", binaryFileName),
                path.join(workspaceFolder, "target", "debug", binaryFileName),
                path.join(workspaceFolder, "crates", baseName, "target", "release", binaryFileName),
                path.join(workspaceFolder, "crates", baseName, "target", "debug", binaryFileName),
                path.join(workspaceFolder, "packages", "extension", "bin", platformArch, binaryFileName),
                path.join(workspaceFolder, "packages", "extension", "bin", binaryFileName)
            );
        }
    }

    if (options.extensionPath) {
        candidatePaths.push(
            path.join(options.extensionPath, "..", "..", "target", "release", binaryFileName),
            path.join(options.extensionPath, "..", "..", "target", "debug", binaryFileName)
        );
    }

    for (const candidate of candidatePaths) {
        if (fileChecker(candidate)) {
            enforceExecutablePermissions(candidate, platform, fileChecker, chmodRunner);
            return candidate;
        }
    }

    return binaryFileName;
}
