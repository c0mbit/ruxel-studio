export type ColorScheme = "light" | "dark" | "system";

export interface ColorPalette {
    readonly primary: string;
    readonly on_primary: string;
    readonly primary_container: string;
    readonly on_primary_container: string;
    readonly secondary: string;
    readonly on_secondary: string;
    readonly secondary_container: string;
    readonly on_secondary_container: string;
    readonly tertiary: string;
    readonly on_tertiary: string;
    readonly tertiary_container: string;
    readonly on_tertiary_container: string;
    readonly error: string;
    readonly on_error: string;
    readonly error_container: string;
    readonly on_error_container: string;
    readonly surface: string;
    readonly on_surface: string;
    readonly surface_variant: string;
    readonly on_surface_variant: string;
    readonly outline: string;
    readonly outline_variant: string;
    readonly background: string;
    readonly on_background: string;
    readonly inverse_surface: string;
    readonly inverse_on_surface: string;
    readonly inverse_primary: string;
    readonly scrim: string;
    readonly shadow: string;
}

export interface ColorPalettes {
    readonly light: ColorPalette;
    readonly dark: ColorPalette;
}

export interface TypeStyle {
    readonly font_family: string;
    readonly font_weight: string;
    readonly font_size: number;
    readonly line_height: number;
    readonly letter_spacing: number;
}

export interface TypeScale {
    readonly display_large: TypeStyle;
    readonly display_medium: TypeStyle;
    readonly display_small: TypeStyle;
    readonly headline_large: TypeStyle;
    readonly headline_medium: TypeStyle;
    readonly headline_small: TypeStyle;
    readonly title_large: TypeStyle;
    readonly title_medium: TypeStyle;
    readonly title_small: TypeStyle;
    readonly body_large: TypeStyle;
    readonly body_medium: TypeStyle;
    readonly body_small: TypeStyle;
    readonly label_large: TypeStyle;
    readonly label_medium: TypeStyle;
    readonly label_small: TypeStyle;
}

export interface ShadowToken {
    readonly name: string;
    readonly offset_x: number;
    readonly offset_y: number;
    readonly blur_radius: number;
    readonly spread_radius: number;
    readonly color: string;
}

export interface SpacingScale {
    readonly none: number;
    readonly xs: number;
    readonly sm: number;
    readonly md: number;
    readonly lg: number;
    readonly xl: number;
    readonly xxl: number;
}

export interface BorderRadii {
    readonly none: number;
    readonly sm: number;
    readonly md: number;
    readonly lg: number;
    readonly xl: number;
    readonly full: number;
}

export interface ThemeConfig {
    readonly active_scheme: ColorScheme;
    readonly color_palettes: ColorPalettes;
    readonly typography: TypeScale;
    readonly border_radii: BorderRadii;
    readonly shadows: readonly ShadowToken[];
    readonly spacing: SpacingScale;
}
