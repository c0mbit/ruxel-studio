export type FontWeight =
    | "thin"
    | "extra_light"
    | "light"
    | "normal"
    | "medium"
    | "semi_bold"
    | "bold"
    | "extra_bold"
    | "black";

export type FontStyleVariant = "normal" | "italic" | "oblique";

export type IconFormat = "svg" | "png";

export type ImageFormat = "svg" | "png" | "jpg" | "webp";

export interface FontAsset {
    readonly alias: string;
    readonly path: string;
    readonly weight: FontWeight;
    readonly style: FontStyleVariant;
}

export interface IconAsset {
    readonly alias: string;
    readonly path: string;
    readonly format: IconFormat;
}

export interface ImageAsset {
    readonly alias: string;
    readonly path: string;
    readonly format: ImageFormat;
}

export interface AssetRegistry {
    readonly fonts: readonly FontAsset[];
    readonly icons: readonly IconAsset[];
    readonly images: readonly ImageAsset[];
}
