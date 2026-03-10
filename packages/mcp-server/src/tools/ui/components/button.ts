import { UISpec } from '../types.js';
import { getThemeColors } from '../utils/theme.js';

export function generateButtonCode(name: string, parentPath: string, spec: UISpec): string {
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
