# UI Behavior, Modes & Performance Specification (`ui-spec.md`)

## 1. Simple vs. Advanced Mode Mapping (Display Layer Only)
Both modes edit the exact same `ir` in Zustand (`isAdvancedMode` toggle):
| IR Type | Simple Mode Label | Advanced Mode Label |
|---|---|---|
| `uuid` / `_id` (PK) | *(Row hidden on canvas card; shown as `Identifier` in Inspector)* | `UUID` / `ObjectId` + `[PK]` badge |
| `string` | `Text` | `String(255)` |
| `int` / `decimal` | `Number` | `Int` / `Decimal` |
| `bool` | `Yes / No` | `Boolean` |
| `timestamp` | `Date & Time` | `Timestamp` |
| `enum` | `Choice` | `Enum` |
| `json` | `Data (JSON)` | `JSONB` / `Mixed` |
| Relation (`1:N`, `N:M`) | `HAS MANY` / `MANY TO MANY` | `1 : N` / `N : M` |

## 2. High-FPS Obsidian Bezier Edge Rules (`ObsidianRelationEdge.tsx`)
- Render smooth Bezier paths (`getBezierPath`) in both Light and Dark themes.
- **8 GB RAM Performance Rule:** Render a single `2px` SVG path by default. Render the secondary blurred glow path (`strokeOpacity={0.3}`) and CSS dash animation ONLY when `selected === true` or `isHovered === true`, and disable animation when `prefers-reduced-motion: reduce` is active.

## 3. Keyboard Shortcuts & Component States
- `Backspace` / `Delete`: Remove selected node or relation edge.
- `Ctrl/Cmd + Z` / `Ctrl/Cmd + Y`: Undo / Redo semantic IR state (`Zundo`).
- `Ctrl/Cmd + S`: Trigger explicit immutable IR version save (`FR-13`).