import { BridgeClient } from '../../bridge/bridgeClient.js';
import { VALID_COMPONENTS, ComponentType, UISpec } from './types.js';
import { generateButtonCode } from './components/button.js';
import { generateCardCode } from './components/card.js';
import { generateDialogCode } from './components/dialog.js';
import { generateHealthBarCode } from './components/healthBar.js';
import { generateNotificationCode } from './components/notification.js';
import { generateCustomCode } from './components/custom.js';

function generateCode(component: ComponentType, name: string, parentPath: string, spec: UISpec): string {
    switch (component) {
        case 'button': return generateButtonCode(name, parentPath, spec);
        case 'card': return generateCardCode(name, parentPath, spec);
        case 'dialog': return generateDialogCode(name, parentPath, spec);
        case 'notification': return generateNotificationCode(name, parentPath, spec);
        case 'health_bar': return generateHealthBarCode(name, parentPath, spec);
        case 'shop_panel':
        case 'leaderboard':
        case 'tab_bar':
        case 'inventory_slot':
            // These use the card layout as a base with component-specific additions
            return generateCardCode(name, parentPath, {
                ...spec,
                text: spec.text || component.replace('_', ' ').replace(/\\b\\w/g, c => c.toUpperCase()),
            });
        case 'custom':
        default:
            return generateCustomCode(name, parentPath, spec);
    }
}

export function createUITool(bridge: BridgeClient) {
    return {
        name: 'create_ui',
        description:
            'Create a polished, styled UI component in Roblox Studio (edit mode). ' +
            'Generates a complete UI hierarchy with proper UDim2 scaling, UICorner, UIStroke, UIGradient, ' +
            'TweenService animations, font styling, and responsive design patterns. ' +
            'Supports component presets (button, card, dialog, notification, health_bar, shop_panel, inventory_slot, leaderboard, tab_bar, custom). ' +
            'All generated UIs use Scale-based sizing for responsiveness, modern fonts (Gotham), dark/light themes, and smooth animations. ' +
            'For best results, read the roblox://reference/ui-guide resource first for context on Roblox UI patterns.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                component: {
                    type: 'string',
                    enum: [...VALID_COMPONENTS],
                    description:
                        'UI component type to create. ' +
                        'button: styled button with hover/click animations. ' +
                        'card: container with rounded corners, padding, and list layout. ' +
                        'dialog: modal with backdrop, title, message, confirm/cancel buttons. ' +
                        'notification: toast notification that slides in and auto-dismisses. ' +
                        'health_bar: gradient-filled progress bar with animated fill. ' +
                        'shop_panel/leaderboard/tab_bar/inventory_slot: specialized cards. ' +
                        'custom: blank styled frame for custom content.',
                },
                name: {
                    type: 'string',
                    description: 'Name for the UI element (e.g. "PlayButton", "SettingsDialog").',
                },
                parentPath: {
                    type: 'string',
                    description: 'Dot-separated parent path. Use "game.StarterGui" for new UIs (auto-creates ScreenGui). Example: "game.StarterGui.ExistingScreenGui".',
                },
                spec: {
                    type: 'object',
                    description: 'UI specification: size, position, theme, colors, text, animations, etc.',
                    properties: {
                        size: {
                            type: 'object',
                            description: 'UDim2 size: { xScale, xOffset, yScale, yOffset }. Defaults vary per component.',
                        },
                        position: {
                            type: 'object',
                            description: 'UDim2 position: { xScale, xOffset, yScale, yOffset }. Default: centered.',
                        },
                        anchorPoint: {
                            type: 'object',
                            description: 'AnchorPoint: { x, y }, each 0–1. Default: { 0.5, 0.5 } (centered).',
                        },
                        theme: {
                            type: 'string',
                            enum: ['dark', 'light'],
                            description: 'Color theme. Default: "dark" (modern navy/red). "light" for white cards with blue accent.',
                        },
                        colors: {
                            type: 'object',
                            description: 'Custom color overrides as hex strings: { background, accent, text, border }.',
                        },
                        cornerRadius: {
                            type: 'number',
                            description: 'UICorner radius in pixels. Default: 10–16 depending on component.',
                        },
                        text: {
                            type: 'string',
                            description: 'Text content (button label, dialog message, card title, notification text).',
                        },
                        fontSize: {
                            type: 'number',
                            description: 'Font size in pixels. Default: 14–20 depending on component.',
                        },
                        animated: {
                            type: 'boolean',
                            description: 'Enable TweenService animations (hover, slide, fade). Default: true.',
                        },
                    },
                },
                studioId: {
                    type: 'string',
                    description: 'Optional Studio instance ID.',
                },
            },
            required: ['component', 'name', 'parentPath'],
        },
        handler: async (args: Record<string, unknown>) => {
            const component = args.component as ComponentType;
            const name = args.name as string;
            const parentPath = args.parentPath as string;
            const spec = (args.spec as UISpec) || {};

            if (!VALID_COMPONENTS.includes(component)) {
                return {
                    content: [{
                        type: 'text' as const,
                        text: `Error: Invalid component type "${component}". Valid types: ${VALID_COMPONENTS.join(', ')}`,
                    }],
                    isError: true,
                };
            }

            const code = generateCode(component, name, parentPath, spec);

            try {
                const result = await bridge.runCode(code, args.studioId as string | undefined);
                const output = typeof result === 'object' && result !== null && 'output' in result
                    ? (result as { output: string }).output
                    : JSON.stringify(result);

                return {
                    content: [{
                        type: 'text' as const,
                        text: `✅ Created ${component} UI component "${name}" in ${parentPath}\n\n${output}\n\nGenerated Lua code (${code.split('\n').length} lines) with:\n` +
                            `• Theme: ${spec.theme || 'dark'}\n` +
                            `• Corner radius: ${spec.cornerRadius ?? 'default'}px\n` +
                            `• Animations: ${spec.animated !== false ? 'enabled' : 'disabled'}\n` +
                            `• Font: Gotham (Bold/Medium)\n` +
                            `• Scaling: UDim2 with responsive defaults`,
                    }],
                };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return {
                    content: [{
                        type: 'text' as const,
                        text: `Error creating UI: ${message}\n\nGenerated code:\n\`\`\`lua\n${code}\n\`\`\``,
                    }],
                    isError: true,
                };
            }
        },
    };
}
