import { BridgeClient } from '../bridge/bridgeClient.js';
import { ResourceDefinition } from './index.js';

const UI_GUIDE = `# Roblox UI Development Reference

## UDim2 Scaling Best Practices

### Scale vs Offset
- **Scale (0–1)**: Percentage of parent size. Use for responsive UIs that adapt to screen size.
- **Offset (pixels)**: Fixed pixel values. Use for exact sizes like icon dimensions or padding.
- **Rule of thumb**: Position with Scale, size with Scale + small Offset tweaks.

### Common Patterns
\`\`\`lua
-- Centered element (50% from edges, anchor at center)
frame.AnchorPoint = Vector2.new(0.5, 0.5)
frame.Position = UDim2.fromScale(0.5, 0.5)

-- Full-screen overlay
frame.Size = UDim2.fromScale(1, 1)
frame.Position = UDim2.fromScale(0, 0)

-- Responsive width, fixed height
frame.Size = UDim2.new(0.8, 0, 0, 60)  -- 80% width, 60px tall

-- Bottom-anchored bar
frame.AnchorPoint = Vector2.new(0.5, 1)
frame.Position = UDim2.new(0.5, 0, 1, -20)  -- 20px from bottom
frame.Size = UDim2.new(0.9, 0, 0, 50)

-- Top-left with margin
frame.Position = UDim2.new(0, 20, 0, 20)
frame.Size = UDim2.new(0, 200, 0, 40)
\`\`\`

---

## TweenService Reference

### EasingStyle Values
| Style | Effect |
|-------|--------|
| Linear | Constant speed |
| Quad | Smooth acceleration |
| Cubic | Stronger acceleration |
| Quart / Quint | Very strong acceleration |
| Sine | Gentle, natural feeling |
| Back | Overshoots then settles |
| Bounce | Bounces at endpoint |
| Elastic | Spring-like oscillation |
| Exponential | Sharp acceleration |
| Circular | Circular motion feel |

### EasingDirection: In (starts slow), Out (ends slow), InOut (both)

### Common Animation Recipes
\`\`\`lua
local TweenService = game:GetService("TweenService")

-- Fade in (0.3s, smooth)
local fadeIn = TweenService:Create(frame, TweenInfo.new(0.3, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
    BackgroundTransparency = 0
})

-- Slide from bottom
frame.Position = UDim2.new(0.5, 0, 1.5, 0)  -- Start off-screen
local slideUp = TweenService:Create(frame, TweenInfo.new(0.5, Enum.EasingStyle.Back, Enum.EasingDirection.Out), {
    Position = UDim2.new(0.5, 0, 0.5, 0)
})

-- Scale bounce (pop-in effect)
frame.Size = UDim2.fromScale(0, 0)
local popIn = TweenService:Create(frame, TweenInfo.new(0.4, Enum.EasingStyle.Back, Enum.EasingDirection.Out), {
    Size = UDim2.fromScale(0.5, 0.6)
})

-- Hover grow effect
local hoverGrow = TweenService:Create(button, TweenInfo.new(0.15, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
    Size = UDim2.new(0, 210, 0, 55)  -- slightly larger
})
local hoverShrink = TweenService:Create(button, TweenInfo.new(0.15, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
    Size = UDim2.new(0, 200, 0, 50)
})

-- Pulse glow (looping)
local pulse = TweenService:Create(glow, TweenInfo.new(1.5, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, -1, true), {
    ImageTransparency = 0.5
})

-- Smooth health bar fill
local fillTween = TweenService:Create(fillFrame, TweenInfo.new(0.3, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
    Size = UDim2.new(healthPercent, 0, 1, 0)
})
\`\`\`

---

## UI Components Reference

### UICorner
Rounds corners. CornerRadius is a UDim (Scale or Offset).
\`\`\`lua
local corner = Instance.new("UICorner")
corner.CornerRadius = UDim.new(0, 12)   -- 12px radius
corner.Parent = frame
-- Fully round (pill shape): UDim.new(1, 0)
\`\`\`

### UIStroke
Border/outline around UI elements.
\`\`\`lua
local stroke = Instance.new("UIStroke")
stroke.Color = Color3.fromHex("#ffffff")
stroke.Thickness = 1.5
stroke.Transparency = 0.7
stroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
stroke.Parent = frame
\`\`\`

### UIGradient
Color/transparency gradient.
\`\`\`lua
local gradient = Instance.new("UIGradient")
gradient.Color = ColorSequence.new({
    ColorSequenceKeypoint.new(0, Color3.fromHex("#667eea")),
    ColorSequenceKeypoint.new(1, Color3.fromHex("#764ba2")),
})
gradient.Rotation = 45
gradient.Parent = frame
\`\`\`

### UIListLayout
Auto-arranges children in a list.
\`\`\`lua
local layout = Instance.new("UIListLayout")
layout.FillDirection = Enum.FillDirection.Vertical
layout.HorizontalAlignment = Enum.HorizontalAlignment.Center
layout.Padding = UDim.new(0, 8)
layout.SortOrder = Enum.SortOrder.LayoutOrder
layout.Parent = frame
\`\`\`

### UIGridLayout
Grid arrangement.
\`\`\`lua
local grid = Instance.new("UIGridLayout")
grid.CellSize = UDim2.new(0, 80, 0, 80)
grid.CellPadding = UDim2.new(0, 8, 0, 8)
grid.FillDirection = Enum.FillDirection.Horizontal
grid.SortOrder = Enum.SortOrder.LayoutOrder
grid.Parent = frame
\`\`\`

### UIPadding
Inner padding.
\`\`\`lua
local padding = Instance.new("UIPadding")
padding.PaddingTop = UDim.new(0, 12)
padding.PaddingBottom = UDim.new(0, 12)
padding.PaddingLeft = UDim.new(0, 16)
padding.PaddingRight = UDim.new(0, 16)
padding.Parent = frame
\`\`\`

### UIAspectRatioConstraint
Maintains aspect ratio.
\`\`\`lua
local aspect = Instance.new("UIAspectRatioConstraint")
aspect.AspectRatio = 1         -- square
aspect.AspectType = Enum.AspectType.FitWithinMaxSize
aspect.Parent = frame
\`\`\`

### UISizeConstraint
Min/max size limits.
\`\`\`lua
local sizeConstraint = Instance.new("UISizeConstraint")
sizeConstraint.MinSize = Vector2.new(200, 40)
sizeConstraint.MaxSize = Vector2.new(600, 80)
sizeConstraint.Parent = frame
\`\`\`

---

## Font Reference

| Font Family | Best For |
|-------------|----------|
| GothamBold | Headings, buttons, emphasis |
| GothamMedium | Subheadings, labels |
| Gotham | Body text |
| GothamBlack | Large titles, splash text |
| SourceSansPro | Default Roblox, readable body text |
| SourceSansBold | Emphasized body text |
| RobotoMono | Code, numbers, monospaced data |
| Ubuntu | Clean modern alternative |
| Nunito | Rounded, friendly UI |
| FredokaOne | Playful, game titles |
| TitilliumWeb | Sci-fi, tech UIs |
| Oswald | Condensed headings |

\`\`\`lua
label.FontFace = Font.new("rbxasset://fonts/families/GothamSSm.json", Enum.FontWeight.Bold)
label.TextSize = 18
\`\`\`

---

## Color Palettes

### Dark Theme (Modern Game UI)
\`\`\`lua
local DARK = {
    bg =          Color3.fromHex("#0f0f1a"),   -- deep navy
    card =        Color3.fromHex("#1a1a2e"),   -- card background
    cardHover =   Color3.fromHex("#252545"),   -- card hover
    accent =      Color3.fromHex("#e94560"),   -- red accent
    accentAlt =   Color3.fromHex("#00b4d8"),   -- blue accent
    text =        Color3.fromHex("#eaeaea"),   -- primary text
    textDim =     Color3.fromHex("#8888aa"),   -- secondary text
    success =     Color3.fromHex("#4ecdc4"),   -- green
    warning =     Color3.fromHex("#ffd166"),   -- yellow
    error =       Color3.fromHex("#ef476f"),   -- red
    border =      Color3.fromHex("#2a2a4a"),   -- subtle border
}
\`\`\`

### Light Theme
\`\`\`lua
local LIGHT = {
    bg =          Color3.fromHex("#f8f9fa"),
    card =        Color3.fromHex("#ffffff"),
    cardHover =   Color3.fromHex("#f0f0f5"),
    accent =      Color3.fromHex("#4361ee"),
    text =        Color3.fromHex("#212529"),
    textDim =     Color3.fromHex("#6c757d"),
    border =      Color3.fromHex("#dee2e6"),
}
\`\`\`

### Gradient Presets
\`\`\`lua
-- Sunset:   #f093fb → #f5576c
-- Ocean:    #667eea → #764ba2
-- Emerald:  #11998e → #38ef7d
-- Fire:     #f12711 → #f5af19
-- Midnight: #232526 → #414345
-- Neon:     #00f5a0 → #00d9f5
\`\`\`

---

## Responsive Design Patterns

### AutomaticSize
\`\`\`lua
frame.AutomaticSize = Enum.AutomaticSize.Y  -- grows to fit content vertically
frame.Size = UDim2.new(1, 0, 0, 0)          -- full width, auto height
\`\`\`

### ScrollingFrame
\`\`\`lua
local scroll = Instance.new("ScrollingFrame")
scroll.Size = UDim2.fromScale(1, 1)
scroll.CanvasSize = UDim2.new(0, 0, 0, 0)  -- set manually or use AutoCanvas
scroll.AutomaticCanvasSize = Enum.AutomaticSize.Y
scroll.ScrollBarThickness = 4
scroll.ScrollBarImageColor3 = Color3.fromHex("#888888")
scroll.BackgroundTransparency = 1
scroll.BorderSizePixel = 0
\`\`\`

### Drop Shadow Pattern
\`\`\`lua
-- Create shadow behind the main card
local shadow = Instance.new("ImageLabel")
shadow.Image = "rbxassetid://5554236805"  -- 100x100 shadow sprite
shadow.ScaleType = Enum.ScaleType.Slice
shadow.SliceCenter = Rect.new(23, 23, 77, 77)
shadow.ImageColor3 = Color3.new(0, 0, 0)
shadow.ImageTransparency = 0.6
shadow.Size = UDim2.new(1, 30, 1, 30)
shadow.Position = UDim2.new(0, -15, 0, -10)
shadow.BackgroundTransparency = 1
shadow.ZIndex = parentFrame.ZIndex - 1
shadow.Parent = parentFrame
\`\`\`

### Button with Hover Effect
\`\`\`lua
local TweenService = game:GetService("TweenService")
local tweenInfo = TweenInfo.new(0.15, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)

button.MouseEnter:Connect(function()
    TweenService:Create(button, tweenInfo, {
        BackgroundColor3 = hoverColor,
        Size = UDim2.new(0, 210, 0, 55)
    }):Play()
end)
button.MouseLeave:Connect(function()
    TweenService:Create(button, tweenInfo, {
        BackgroundColor3 = normalColor,
        Size = UDim2.new(0, 200, 0, 50)
    }):Play()
end)
\`\`\`

---

## ScreenGui Best Practices
\`\`\`lua
local gui = Instance.new("ScreenGui")
gui.Name = "MyUI"
gui.ResetOnSpawn = false                    -- persist across respawns
gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling  -- use ZIndex per-element
gui.IgnoreGuiInset = true                   -- extend under topbar
gui.DisplayOrder = 10                       -- higher = on top of other GUIs
gui.Parent = game.StarterGui                -- or player.PlayerGui at runtime
\`\`\`
`;

export function uiReferenceResource(): ResourceDefinition {
    return {
        uri: 'roblox://reference/ui-guide',
        name: 'Roblox UI Development Guide',
        description: 'Comprehensive reference for building polished Roblox UIs: UDim2 scaling, TweenService, UICorner, UIGradient, UIListLayout, color palettes, fonts, and responsive design patterns.',
        mimeType: 'text/markdown',
        handler: async () => {
            return {
                contents: [{
                    uri: 'roblox://reference/ui-guide',
                    mimeType: 'text/markdown',
                    text: UI_GUIDE,
                }],
            };
        },
    };
}
