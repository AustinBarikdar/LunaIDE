import { UISpec } from '../types.js';
import { getThemeColors } from '../utils/theme.js';

export function generateHealthBarCode(name: string, parentPath: string, spec: UISpec): string {
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
