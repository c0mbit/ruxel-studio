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

export function createDefaultTheme(): ThemeConfig {
    return {
        active_scheme: "dark",
        color_palettes: {
            light: {
                primary: "#0061A4",
                on_primary: "#FFFFFF",
                primary_container: "#D1E4FF",
                on_primary_container: "#001D36",
                secondary: "#535F70",
                on_secondary: "#FFFFFF",
                secondary_container: "#D7E3F7",
                on_secondary_container: "#101C2B",
                tertiary: "#6B5778",
                on_tertiary: "#FFFFFF",
                tertiary_container: "#F2DAFF",
                on_tertiary_container: "#251431",
                error: "#BA1A1A",
                on_error: "#FFFFFF",
                error_container: "#FFDAD6",
                on_error_container: "#410002",
                surface: "#FDFCFF",
                on_surface: "#1A1C1E",
                surface_variant: "#DFE2EB",
                on_surface_variant: "#43474E",
                outline: "#73777F",
                outline_variant: "#C3C7D0",
                background: "#FDFCFF",
                on_background: "#1A1C1E",
                inverse_surface: "#2F3033",
                inverse_on_surface: "#F1F0F4",
                inverse_primary: "#9ECAFF",
                scrim: "#000000",
                shadow: "#000000",
            },
            dark: {
                primary: "#9ECAFF",
                on_primary: "#003258",
                primary_container: "#00497D",
                on_primary_container: "#D1E4FF",
                secondary: "#BBC7DB",
                on_secondary: "#253140",
                secondary_container: "#3B4858",
                on_secondary_container: "#D7E3F7",
                tertiary: "#D6BEE4",
                on_tertiary: "#3B2948",
                tertiary_container: "#523F5F",
                on_tertiary_container: "#F2DAFF",
                error: "#FFB4AB",
                on_error: "#690005",
                error_container: "#93000A",
                on_error_container: "#FFDAD6",
                surface: "#1A1C1E",
                on_surface: "#E2E2E6",
                surface_variant: "#43474E",
                on_surface_variant: "#C3C7D0",
                outline: "#8D9199",
                outline_variant: "#43474E",
                background: "#1A1C1E",
                on_background: "#E2E2E6",
                inverse_surface: "#E2E2E6",
                inverse_on_surface: "#2F3033",
                inverse_primary: "#0061A4",
                scrim: "#000000",
                shadow: "#000000",
            },
        },
        typography: {
            display_large: { font_family: "system-ui", font_weight: "bold", font_size: 57, line_height: 64, letter_spacing: -0.25 },
            display_medium: { font_family: "system-ui", font_weight: "bold", font_size: 45, line_height: 52, letter_spacing: 0 },
            display_small: { font_family: "system-ui", font_weight: "bold", font_size: 36, line_height: 44, letter_spacing: 0 },
            headline_large: { font_family: "system-ui", font_weight: "normal", font_size: 32, line_height: 40, letter_spacing: 0 },
            headline_medium: { font_family: "system-ui", font_weight: "normal", font_size: 28, line_height: 36, letter_spacing: 0 },
            headline_small: { font_family: "system-ui", font_weight: "normal", font_size: 24, line_height: 32, letter_spacing: 0 },
            title_large: { font_family: "system-ui", font_weight: "normal", font_size: 22, line_height: 28, letter_spacing: 0 },
            title_medium: { font_family: "system-ui", font_weight: "medium", font_size: 16, line_height: 24, letter_spacing: 0.15 },
            title_small: { font_family: "system-ui", font_weight: "medium", font_size: 14, line_height: 20, letter_spacing: 0.1 },
            body_large: { font_family: "system-ui", font_weight: "normal", font_size: 16, line_height: 24, letter_spacing: 0.5 },
            body_medium: { font_family: "system-ui", font_weight: "normal", font_size: 14, line_height: 20, letter_spacing: 0.25 },
            body_small: { font_family: "system-ui", font_weight: "normal", font_size: 12, line_height: 16, letter_spacing: 0.4 },
            label_large: { font_family: "system-ui", font_weight: "medium", font_size: 14, line_height: 20, letter_spacing: 0.1 },
            label_medium: { font_family: "system-ui", font_weight: "medium", font_size: 12, line_height: 16, letter_spacing: 0.5 },
            label_small: { font_family: "system-ui", font_weight: "medium", font_size: 11, line_height: 16, letter_spacing: 0.5 },
        },
        border_radii: {
            none: 0,
            sm: 4,
            md: 8,
            lg: 12,
            xl: 16,
            full: 9999,
        },
        shadows: [],
        spacing: {
            none: 0,
            xs: 4,
            sm: 8,
            md: 16,
            lg: 24,
            xl: 32,
            xxl: 48,
        },
    };
}
