import { BridgeClient } from '../bridge/bridgeClient.js';

const VALID_COMPONENTS = ['button', 'card', 'dialog', 'notification', 'health_bar', 'shop_panel', 'inventory_slot', 'leaderboard', 'tab_bar', 'custom'] as const;
type ComponentType = typeof VALID_COMPONENTS[number];

interface UISpec {
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

function hexToRgb(hex: string): string {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16) / 255;
    const g = parseInt(h.substring(2, 4), 16) / 255;
    const b = parseInt(h.substring(4, 6), 16) / 255;
    return `Color3.new(${r.toFixed(3)}, ${g.toFixed(3)}, ${b.toFixed(3)})`;
}

function getThemeColors(theme: string, custom?: UISpec['colors']): Record<string, string> {
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

function generateButtonCode(name: string, parentPath: string, spec: UISpec): string {
    const c = getThemeColors(spec.theme || 'dark', spec.colors);
    const radius = spec.cornerRadius ?? 10;
    const text = spec.text || 'Button';
    const fontSize = spec.fontSize ?? 16;
    const animated = spec.animated !== false;

    return `
-- Create ScreenGui if parent is StarterGui
local parent = ${parentPath}
if parent:IsA("StarterGui") or parent:IsA("PlayerGui") then
    local sg = Instance.new("ScreenGui")
    sg.Name = "${name}_Gui"
    sg.ResetOnSpawn = false
    sg.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
    sg.Parent = parent
    parent = sg
end

-- Button container
local btn = Instance.new("TextButton")
btn.Name = "${name}"
btn.AnchorPoint = Vector2.new(${spec.anchorPoint?.x ?? 0.5}, ${spec.anchorPoint?.y ?? 0.5})
btn.Position = UDim2.new(${spec.position?.xScale ?? 0.5}, ${spec.position?.xOffset ?? 0}, ${spec.position?.yScale ?? 0.5}, ${spec.position?.yOffset ?? 0})
btn.Size = UDim2.new(${spec.size?.xScale ?? 0}, ${spec.size?.xOffset ?? 220}, ${spec.size?.yScale ?? 0}, ${spec.size?.yOffset ?? 56})
btn.BackgroundColor3 = ${c.accent}
btn.BorderSizePixel = 0
btn.AutoButtonColor = false
btn.Text = ""
btn.Parent = parent

-- Corner
local corner = Instance.new("UICorner")
corner.CornerRadius = UDim.new(0, ${radius})
corner.Parent = btn

-- Stroke
local stroke = Instance.new("UIStroke")
stroke.Color = ${c.border}
stroke.Thickness = 1
stroke.Transparency = 0.5
stroke.Parent = btn

-- Label
local label = Instance.new("TextLabel")
label.Name = "Label"
label.Size = UDim2.fromScale(1, 1)
label.BackgroundTransparency = 1
label.Text = "${text}"
label.TextColor3 = ${c.text}
label.TextSize = ${fontSize}
label.FontFace = Font.new("rbxasset://fonts/families/GothamSSm.json", Enum.FontWeight.Bold)
label.Parent = btn
${animated ? `
-- Hover animations
local TweenService = game:GetService("TweenService")
local tweenInfo = TweenInfo.new(0.15, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
local normalSize = btn.Size
local hoverSize = UDim2.new(normalSize.X.Scale, normalSize.X.Offset + 6, normalSize.Y.Scale, normalSize.Y.Offset + 4)

btn.MouseEnter:Connect(function()
    TweenService:Create(btn, tweenInfo, { Size = hoverSize, BackgroundColor3 = ${c.cardHover} }):Play()
end)
btn.MouseLeave:Connect(function()
    TweenService:Create(btn, tweenInfo, { Size = normalSize, BackgroundColor3 = ${c.accent} }):Play()
end)
btn.MouseButton1Down:Connect(function()
    TweenService:Create(btn, TweenInfo.new(0.05), { Size = normalSize }):Play()
end)
btn.MouseButton1Up:Connect(function()
    TweenService:Create(btn, tweenInfo, { Size = hoverSize }):Play()
end)
` : ''}
print("UI_CREATED: ${name} -> " .. btn:GetFullName())
`;
}

function generateCardCode(name: string, parentPath: string, spec: UISpec): string {
    const c = getThemeColors(spec.theme || 'dark', spec.colors);
    const radius = spec.cornerRadius ?? 16;
    const text = spec.text || '';

    return `
local parent = ${parentPath}
if parent:IsA("StarterGui") or parent:IsA("PlayerGui") then
    local sg = Instance.new("ScreenGui")
    sg.Name = "${name}_Gui"
    sg.ResetOnSpawn = false
    sg.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
    sg.Parent = parent
    parent = sg
end

-- Card frame
local card = Instance.new("Frame")
card.Name = "${name}"
card.AnchorPoint = Vector2.new(${spec.anchorPoint?.x ?? 0.5}, ${spec.anchorPoint?.y ?? 0.5})
card.Position = UDim2.new(${spec.position?.xScale ?? 0.5}, ${spec.position?.xOffset ?? 0}, ${spec.position?.yScale ?? 0.5}, ${spec.position?.yOffset ?? 0})
card.Size = UDim2.new(${spec.size?.xScale ?? 0}, ${spec.size?.xOffset ?? 340}, ${spec.size?.yScale ?? 0}, ${spec.size?.yOffset ?? 200})
card.BackgroundColor3 = ${c.card}
card.BorderSizePixel = 0
card.Parent = parent

Instance.new("UICorner", card).CornerRadius = UDim.new(0, ${radius})

local stroke = Instance.new("UIStroke")
stroke.Color = ${c.border}
stroke.Thickness = 1
stroke.Transparency = 0.4
stroke.Parent = card

local padding = Instance.new("UIPadding")
padding.PaddingTop = UDim.new(0, 20)
padding.PaddingBottom = UDim.new(0, 20)
padding.PaddingLeft = UDim.new(0, 24)
padding.PaddingRight = UDim.new(0, 24)
padding.Parent = card

local layout = Instance.new("UIListLayout")
layout.FillDirection = Enum.FillDirection.Vertical
layout.Padding = UDim.new(0, 12)
layout.SortOrder = Enum.SortOrder.LayoutOrder
layout.Parent = card

${text ? `
local title = Instance.new("TextLabel")
title.Name = "Title"
title.Size = UDim2.new(1, 0, 0, 28)
title.BackgroundTransparency = 1
title.Text = "${text}"
title.TextColor3 = ${c.text}
title.TextSize = 20
title.FontFace = Font.new("rbxasset://fonts/families/GothamSSm.json", Enum.FontWeight.Bold)
title.TextXAlignment = Enum.TextXAlignment.Left
title.LayoutOrder = 1
title.Parent = card
` : ''}
print("UI_CREATED: ${name} -> " .. card:GetFullName())
`;
}

function generateDialogCode(name: string, parentPath: string, spec: UISpec): string {
    const c = getThemeColors(spec.theme || 'dark', spec.colors);
    const radius = spec.cornerRadius ?? 16;
    const text = spec.text || 'Are you sure?';
    const animated = spec.animated !== false;

    return `
local parent = ${parentPath}
local sg = Instance.new("ScreenGui")
sg.Name = "${name}_Gui"
sg.ResetOnSpawn = false
sg.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
sg.DisplayOrder = 100
sg.IgnoreGuiInset = true
sg.Parent = parent

-- Backdrop (semi-transparent overlay)
local backdrop = Instance.new("Frame")
backdrop.Name = "Backdrop"
backdrop.Size = UDim2.fromScale(1, 1)
backdrop.BackgroundColor3 = Color3.new(0, 0, 0)
backdrop.BackgroundTransparency = ${animated ? '1' : '0.5'}
backdrop.BorderSizePixel = 0
backdrop.Parent = sg

-- Dialog panel
local panel = Instance.new("Frame")
panel.Name = "${name}"
panel.AnchorPoint = Vector2.new(0.5, 0.5)
panel.Position = UDim2.fromScale(0.5, 0.5)
panel.Size = UDim2.new(0, ${spec.size?.xOffset ?? 420}, 0, ${spec.size?.yOffset ?? 220})
panel.BackgroundColor3 = ${c.card}
panel.BorderSizePixel = 0
${animated ? 'panel.Size = UDim2.new(0, 0, 0, 0)' : ''}
panel.Parent = sg

Instance.new("UICorner", panel).CornerRadius = UDim.new(0, ${radius})

local stroke = Instance.new("UIStroke")
stroke.Color = ${c.border}
stroke.Thickness = 1
stroke.Transparency = 0.3
stroke.Parent = panel

local padding = Instance.new("UIPadding")
padding.PaddingTop = UDim.new(0, 28)
padding.PaddingBottom = UDim.new(0, 24)
padding.PaddingLeft = UDim.new(0, 28)
padding.PaddingRight = UDim.new(0, 28)
padding.Parent = panel

-- Title
local title = Instance.new("TextLabel")
title.Name = "Title"
title.Size = UDim2.new(1, 0, 0, 28)
title.Position = UDim2.new(0, 0, 0, 0)
title.BackgroundTransparency = 1
title.Text = "Confirm"
title.TextColor3 = ${c.text}
title.TextSize = 22
title.FontFace = Font.new("rbxasset://fonts/families/GothamSSm.json", Enum.FontWeight.Bold)
title.TextXAlignment = Enum.TextXAlignment.Left
title.Parent = panel

-- Message
local msg = Instance.new("TextLabel")
msg.Name = "Message"
msg.Size = UDim2.new(1, 0, 0, 40)
msg.Position = UDim2.new(0, 0, 0, 42)
msg.BackgroundTransparency = 1
msg.Text = "${text}"
msg.TextColor3 = ${c.textDim}
msg.TextSize = 15
msg.FontFace = Font.new("rbxasset://fonts/families/GothamSSm.json", Enum.FontWeight.Regular)
msg.TextXAlignment = Enum.TextXAlignment.Left
msg.TextWrapped = true
msg.Parent = panel

-- Button row
local btnRow = Instance.new("Frame")
btnRow.Name = "ButtonRow"
btnRow.Size = UDim2.new(1, 0, 0, 42)
btnRow.Position = UDim2.new(0, 0, 1, -42)
btnRow.AnchorPoint = Vector2.new(0, 0)
btnRow.BackgroundTransparency = 1
btnRow.Parent = panel

local rowLayout = Instance.new("UIListLayout")
rowLayout.FillDirection = Enum.FillDirection.Horizontal
rowLayout.HorizontalAlignment = Enum.HorizontalAlignment.Right
rowLayout.Padding = UDim.new(0, 12)
rowLayout.Parent = btnRow

-- Cancel button
local cancelBtn = Instance.new("TextButton")
cancelBtn.Name = "CancelButton"
cancelBtn.Size = UDim2.new(0, 100, 0, 42)
cancelBtn.BackgroundColor3 = ${c.border}
cancelBtn.BorderSizePixel = 0
cancelBtn.AutoButtonColor = false
cancelBtn.Text = "Cancel"
cancelBtn.TextColor3 = ${c.text}
cancelBtn.TextSize = 14
cancelBtn.FontFace = Font.new("rbxasset://fonts/families/GothamSSm.json", Enum.FontWeight.Medium)
cancelBtn.LayoutOrder = 1
cancelBtn.Parent = btnRow
Instance.new("UICorner", cancelBtn).CornerRadius = UDim.new(0, 8)

-- Confirm button
local confirmBtn = Instance.new("TextButton")
confirmBtn.Name = "ConfirmButton"
confirmBtn.Size = UDim2.new(0, 100, 0, 42)
confirmBtn.BackgroundColor3 = ${c.accent}
confirmBtn.BorderSizePixel = 0
confirmBtn.AutoButtonColor = false
confirmBtn.Text = "Confirm"
confirmBtn.TextColor3 = ${c.text}
confirmBtn.TextSize = 14
confirmBtn.FontFace = Font.new("rbxasset://fonts/families/GothamSSm.json", Enum.FontWeight.Bold)
confirmBtn.LayoutOrder = 2
confirmBtn.Parent = btnRow
Instance.new("UICorner", confirmBtn).CornerRadius = UDim.new(0, 8)

${animated ? `
-- Animate in
local TweenService = game:GetService("TweenService")
TweenService:Create(backdrop, TweenInfo.new(0.3, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
    BackgroundTransparency = 0.5
}):Play()
panel.Size = UDim2.new(0, 0, 0, 0)
TweenService:Create(panel, TweenInfo.new(0.35, Enum.EasingStyle.Back, Enum.EasingDirection.Out), {
    Size = UDim2.new(0, ${spec.size?.xOffset ?? 420}, 0, ${spec.size?.yOffset ?? 220})
}):Play()
` : ''}
print("UI_CREATED: ${name} -> " .. panel:GetFullName())
`;
}

function generateHealthBarCode(name: string, parentPath: string, spec: UISpec): string {
    const c = getThemeColors(spec.theme || 'dark', spec.colors);
    const animated = spec.animated !== false;

    return `
local parent = ${parentPath}
if parent:IsA("StarterGui") or parent:IsA("PlayerGui") then
    local sg = Instance.new("ScreenGui")
    sg.Name = "${name}_Gui"
    sg.ResetOnSpawn = false
    sg.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
    sg.Parent = parent
    parent = sg
end

-- Container
local container = Instance.new("Frame")
container.Name = "${name}"
container.AnchorPoint = Vector2.new(${spec.anchorPoint?.x ?? 0.5}, ${spec.anchorPoint?.y ?? 0})
container.Position = UDim2.new(${spec.position?.xScale ?? 0.5}, ${spec.position?.xOffset ?? 0}, ${spec.position?.yScale ?? 0}, ${spec.position?.yOffset ?? 20})
container.Size = UDim2.new(${spec.size?.xScale ?? 0.3}, ${spec.size?.xOffset ?? 0}, ${spec.size?.yScale ?? 0}, ${spec.size?.yOffset ?? 28})
container.BackgroundColor3 = ${c.card}
container.BorderSizePixel = 0
container.Parent = parent

Instance.new("UICorner", container).CornerRadius = UDim.new(0, 8)

local stroke = Instance.new("UIStroke")
stroke.Color = ${c.border}
stroke.Thickness = 1
stroke.Transparency = 0.5
stroke.Parent = container

-- Fill bar
local fill = Instance.new("Frame")
fill.Name = "Fill"
fill.Size = UDim2.new(1, 0, 1, 0)  -- 100% = full health
fill.BackgroundColor3 = ${c.accent}
fill.BorderSizePixel = 0
fill.ClipsDescendants = true
fill.Parent = container

Instance.new("UICorner", fill).CornerRadius = UDim.new(0, 8)

-- Gradient on fill
local gradient = Instance.new("UIGradient")
gradient.Color = ColorSequence.new({
    ColorSequenceKeypoint.new(0, Color3.fromRGB(78, 205, 196)),
    ColorSequenceKeypoint.new(0.5, Color3.fromRGB(255, 209, 102)),
    ColorSequenceKeypoint.new(1, Color3.fromRGB(239, 71, 111)),
})
gradient.Parent = fill

-- Health text
local healthLabel = Instance.new("TextLabel")
healthLabel.Name = "HealthText"
healthLabel.Size = UDim2.fromScale(1, 1)
healthLabel.BackgroundTransparency = 1
healthLabel.Text = "100 / 100"
healthLabel.TextColor3 = ${c.text}
healthLabel.TextSize = 14
healthLabel.FontFace = Font.new("rbxasset://fonts/families/GothamSSm.json", Enum.FontWeight.Bold)
healthLabel.ZIndex = 5
healthLabel.Parent = container

${animated ? `
-- Helper function to animate health changes
-- Usage: updateHealth(fill, 0.75) for 75% health
local TweenService = game:GetService("TweenService")
local function updateHealth(fillBar, percent)
    TweenService:Create(fillBar, TweenInfo.new(0.3, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
        Size = UDim2.new(math.clamp(percent, 0, 1), 0, 1, 0)
    }):Play()
end
-- Demo: animate to 75%
task.delay(0.5, function() updateHealth(fill, 0.75) end)
` : ''}
print("UI_CREATED: ${name} -> " .. container:GetFullName())
`;
}

function generateNotificationCode(name: string, parentPath: string, spec: UISpec): string {
    const c = getThemeColors(spec.theme || 'dark', spec.colors);
    const radius = spec.cornerRadius ?? 12;
    const text = spec.text || 'Notification message';
    const animated = spec.animated !== false;

    return `
local parent = ${parentPath}
local sg = Instance.new("ScreenGui")
sg.Name = "${name}_Gui"
sg.ResetOnSpawn = false
sg.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
sg.DisplayOrder = 50
sg.Parent = parent

local toast = Instance.new("Frame")
toast.Name = "${name}"
toast.AnchorPoint = Vector2.new(0.5, 0)
toast.Position = UDim2.new(0.5, 0, 0, ${animated ? '-80' : '20'})
toast.Size = UDim2.new(0, ${spec.size?.xOffset ?? 360}, 0, ${spec.size?.yOffset ?? 60})
toast.BackgroundColor3 = ${c.card}
toast.BorderSizePixel = 0
toast.Parent = sg

Instance.new("UICorner", toast).CornerRadius = UDim.new(0, ${radius})

local stroke = Instance.new("UIStroke")
stroke.Color = ${c.accent}
stroke.Thickness = 1.5
stroke.Transparency = 0.3
stroke.Parent = toast

local padding = Instance.new("UIPadding")
padding.PaddingLeft = UDim.new(0, 20)
padding.PaddingRight = UDim.new(0, 20)
padding.Parent = toast

local icon = Instance.new("TextLabel")
icon.Name = "Icon"
icon.Size = UDim2.new(0, 24, 0, 24)
icon.AnchorPoint = Vector2.new(0, 0.5)
icon.Position = UDim2.new(0, 0, 0.5, 0)
icon.BackgroundTransparency = 1
icon.Text = "●"
icon.TextColor3 = ${c.accent}
icon.TextSize = 18
icon.Parent = toast

local msg = Instance.new("TextLabel")
msg.Name = "Message"
msg.Size = UDim2.new(1, -30, 1, 0)
msg.Position = UDim2.new(0, 30, 0, 0)
msg.BackgroundTransparency = 1
msg.Text = "${text}"
msg.TextColor3 = ${c.text}
msg.TextSize = 14
msg.FontFace = Font.new("rbxasset://fonts/families/GothamSSm.json", Enum.FontWeight.Medium)
msg.TextXAlignment = Enum.TextXAlignment.Left
msg.TextWrapped = true
msg.Parent = toast

${animated ? `
local TweenService = game:GetService("TweenService")
-- Slide in from top
TweenService:Create(toast, TweenInfo.new(0.4, Enum.EasingStyle.Back, Enum.EasingDirection.Out), {
    Position = UDim2.new(0.5, 0, 0, 20)
}):Play()

-- Auto-dismiss after 4 seconds
task.delay(4, function()
    TweenService:Create(toast, TweenInfo.new(0.3, Enum.EasingStyle.Quad, Enum.EasingDirection.In), {
        Position = UDim2.new(0.5, 0, 0, -80)
    }):Play()
    task.delay(0.35, function() sg:Destroy() end)
end)
` : ''}
print("UI_CREATED: ${name} -> " .. toast:GetFullName())
`;
}

function generateCustomCode(name: string, parentPath: string, spec: UISpec): string {
    const c = getThemeColors(spec.theme || 'dark', spec.colors);
    const radius = spec.cornerRadius ?? 10;

    return `
local parent = ${parentPath}
if parent:IsA("StarterGui") or parent:IsA("PlayerGui") then
    local sg = Instance.new("ScreenGui")
    sg.Name = "${name}_Gui"
    sg.ResetOnSpawn = false
    sg.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
    sg.Parent = parent
    parent = sg
end

local frame = Instance.new("Frame")
frame.Name = "${name}"
frame.AnchorPoint = Vector2.new(${spec.anchorPoint?.x ?? 0.5}, ${spec.anchorPoint?.y ?? 0.5})
frame.Position = UDim2.new(${spec.position?.xScale ?? 0.5}, ${spec.position?.xOffset ?? 0}, ${spec.position?.yScale ?? 0.5}, ${spec.position?.yOffset ?? 0})
frame.Size = UDim2.new(${spec.size?.xScale ?? 0}, ${spec.size?.xOffset ?? 300}, ${spec.size?.yScale ?? 0}, ${spec.size?.yOffset ?? 200})
frame.BackgroundColor3 = ${c.card}
frame.BorderSizePixel = 0
frame.Parent = parent

Instance.new("UICorner", frame).CornerRadius = UDim.new(0, ${radius})

local stroke = Instance.new("UIStroke")
stroke.Color = ${c.border}
stroke.Thickness = 1
stroke.Transparency = 0.5
stroke.Parent = frame

local padding = Instance.new("UIPadding")
padding.PaddingTop = UDim.new(0, 16)
padding.PaddingBottom = UDim.new(0, 16)
padding.PaddingLeft = UDim.new(0, 16)
padding.PaddingRight = UDim.new(0, 16)
padding.Parent = frame

print("UI_CREATED: ${name} -> " .. frame:GetFullName())
`;
}

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
                text: spec.text || component.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()),
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
