import { UISpec } from '../types.js';
import { getThemeColors } from '../utils/theme.js';

export function generateCustomCode(name: string, parentPath: string, spec: UISpec): string {
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
