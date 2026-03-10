import { UISpec } from '../types.js';
import { getThemeColors } from '../utils/theme.js';

export function generateNotificationCode(name: string, parentPath: string, spec: UISpec): string {
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
