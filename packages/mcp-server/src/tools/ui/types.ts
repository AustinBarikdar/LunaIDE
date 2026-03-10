export const VALID_COMPONENTS = ['button', 'card', 'dialog', 'notification', 'health_bar', 'shop_panel', 'inventory_slot', 'leaderboard', 'tab_bar', 'custom'] as const;
export type ComponentType = typeof VALID_COMPONENTS[number];

export interface UISpec {
    size?: { xScale?: number; xOffset?: number; yScale?: number; yOffset?: number };
    position?: { xScale?: number; xOffset?: number; yScale?: number; yOffset?: number };
    anchorPoint?: { x?: number; y?: number };
    theme?: 'dark' | 'light' | 'custom';
    colors?: { background?: string; accent?: string; text?: string; border?: string };
    cornerRadius?: number;
    text?: string;
    fontSize?: number;
    animated?: boolean;
    children?: Array<{ component: string; name?: string; spec?: UISpec }>;
    [key: string]: unknown;
}
