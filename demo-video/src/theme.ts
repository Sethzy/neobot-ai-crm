// Color palette for NeoBot Demo Video
// Based on brand guidelines from creative brief

export const colors = {
    // Primary brand colors
    brandGreen: "#107066",       // Accent green
    brandGreenLight: "#4A9A8E",  // Light accent
    brandGreenDark: "#0B524A",   // Dark accent
    neobotDark: "#2B2B2B",       // NeoBot primary brand color

    // Supporting colors
    secondary: "#E0F0EE",        // New
    accent: "#A8D4CC",           // New

    // Legacy maps (for backward compatibility if needed, but updated values)
    deepTeal: "#0B524A",         // Mapped to new dark
    softMint: "#4A9A8E",         // Mapped to new light

    // Dark mode
    zincDark: "#18181B",         // Code aesthetic
    zincDarker: "#09090B",       // Deeper backgrounds

    // Neutrals
    white: "#FFFFFF",
    offWhite: "#FAFAFA",
    gray100: "#F4F4F5",
    gray200: "#E4E4E7",
    gray400: "#A1A1AA",
    gray600: "#52525B",
    gray800: "#27272A",

    // Semantic
    error: "#EF4444",
    warning: "#F59E0B",
    success: "#10B981",
    info: "#3B82F6",
} as const;

// Spring configurations for consistent animation feel
export const springs = {
    smooth: { damping: 200 },                    // Subtle reveals
    snappy: { damping: 20, stiffness: 200 },     // UI elements
    bouncy: { damping: 8, stiffness: 100 },      // Playful entrances
    heavy: { damping: 15, stiffness: 80, mass: 2 }, // Heavy, slow
} as const;
