import { UISpec } from '../types.js';
import { getThemeColors } from '../utils/theme.js';

export function generateDialogCode(name: string, parentPath: string, spec: UISpec): string {
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
