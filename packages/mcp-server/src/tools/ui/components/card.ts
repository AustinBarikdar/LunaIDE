import { UISpec } from '../types.js';
import { getThemeColors } from '../utils/theme.js';

export function generateCardCode(name: string, parentPath: string, spec: UISpec): string {
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
