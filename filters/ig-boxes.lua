-- Collapsible content boxes.
--
--   ::: {.ig-note label="Terminology" collapse="true"}
--   ...body...
--   :::
--
-- renders as a box whose header bar shows the label and toggles the body.
-- Use collapse="open" to start expanded. Works for .ig-note, .ig-tip, .ig-hint.

local default_labels = {
  ["ig-note"] = "Note",
  ["ig-tip"] = "Tip",
  ["ig-hint"] = "Hint",
}

local function escape_html(s)
  return (s:gsub("&", "&amp;"):gsub("<", "&lt;"):gsub(">", "&gt;"))
end

function Div(el)
  local collapse = el.attributes["collapse"]
  if collapse == nil or collapse == "false" then
    return nil
  end

  local default_label
  for _, cls in ipairs(el.classes) do
    if default_labels[cls] then
      default_label = default_labels[cls]
      break
    end
  end
  if not default_label then
    return nil
  end

  local label = el.attributes["label"] or default_label
  el.attributes["collapse"] = nil
  el.attributes["label"] = nil

  -- The body div keeps heading <section>s from swallowing </details>.
  el.content = {
    pandoc.RawBlock("html", collapse == "open" and "<details open>" or "<details>"),
    pandoc.RawBlock("html", "<summary>" .. escape_html(label) .. "</summary>"),
    pandoc.Div(el.content, pandoc.Attr("", { "ig-box__body" })),
    pandoc.RawBlock("html", "</details>"),
  }
  return el
end
