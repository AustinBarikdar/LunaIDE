import { UISpec } from '../types.js';

export function hexToRgb(hex: string): string {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16) / 255;
    const g = parseInt(h.substring(2, 4), 16) / 255;
    const b = parseInt(h.substring(4, 6), 16) / 255;
    return `Color3.new(${r.toFixed(3)}, ${g.toFixed(3)}, ${b.toFixed(3)})`;
}

export function getThemeColors(theme: string, custom?: UISpec['colors']): Record<string, string> {
    const dark: Record<string, string> = {
        bg: 'Color3.fromRGB(15, 15, 26)',
        card: 'Color3.fromRGB(26, 26, 46)',
        cardHover: 'Color3.fromRGB(37, 37, 69)',
        accent: 'Color3.fromRGB(233, 69, 96)',
        text: 'Color3.fromRGB(234, 234, 234)',
        textDim: 'Color3.fromRGB(136, 136, 170)',
        border: 'Color3.fromRGB(42, 42, 74)',
        success: 'Color3.fromRGB(78, 205, 196)',
        shadow: 'Color3.new(0, 0, 0)',
    };
    const light: Record<string, string> = {
        bg: 'Color3.fromRGB(248, 249, 250)',
        card: 'Color3.fromRGB(255, 255, 255)',
        cardHover: 'Color3.fromRGB(240, 240, 245)',
        accent: 'Color3.fromRGB(67, 97, 238)',
        text: 'Color3.fromRGB(33, 37, 41)',
        textDim: 'Color3.fromRGB(108, 117, 125)',
        border: 'Color3.fromRGB(222, 226, 230)',
        success: 'Color3.fromRGB(40, 167, 69)',
        shadow: 'Color3.fromRGB(0, 0, 0)',
    };

    const base = theme === 'light' ? light : dark;

    if (custom) {
        if (custom.background) base.card = hexToRgb(custom.background);
        if (custom.accent) base.accent = hexToRgb(custom.accent);
        if (custom.text) base.text = hexToRgb(custom.text);
        if (custom.border) base.border = hexToRgb(custom.border);
    }

    return base;
}
