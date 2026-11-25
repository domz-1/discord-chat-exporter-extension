# Discord Hacker · Chat Exporter & Power Tools (WXT · Chrome / Brave / Firefox)

A **WXT + TypeScript** browser extension with a **Liquid Glass** UI that upgrades Discord Web with multi-select, batch forwarding, instant TOON/JSON/Markdown export for LLMs, 1-click blue letter Word Reacts, and muted channel/DM hiding.

## ✨ Features

- **Multi-Select Messages + `Ctrl+C` Shortcut**: Hover any message to toggle its glass checkbox, or `Shift+Click` for range selection. Scroll-safe cache preserves selections across Discord's virtualized list, exports in chronological order, and lets you press **`Ctrl+C` / `Cmd+C`** (English or Arabic keyboard) to copy selected messages as **TOON** instantly.
- **1-Click Copy on Every Message**: Built-in copy button right inside Discord's native message hover bar (`👍 ❤️ | ↩ ↪ ••• | 📋`) — also extracts inline `message.txt` file preview content.
- **Native Multi-Forward**: Click **Forward Selected** to open Discord's own native **Forward To** modal and forward all selected messages together in chronological order.
- **Blue Letter Word React (`A+`)**: Click `A+` on any message to open an inline Liquid Glass popover, type any word with letters (`A–Z`) and numbers (`0–9` / `٠–٩`), preview the blue emojis live, and press `Enter` to react them onto the message in order (`Shift+Click` to instant-repeat your last word).
- **Hide Muted Channels & DMs**: Automatically hides muted server channels, muted categories, and muted Direct Messages / Group DMs (with a synced toggle in both the hover dock and popup).
- **Hover-Only Liquid Glass Dock**: Collapses to a minimal `14px` translucent pearl dot in the bottom-right corner and blooms into a smoked Liquid Glass panel only when hovered.
- **TOON / JSON / Markdown Export**: Saves 30%–60% LLM tokens with TOON serialization for bug audits, QA reviews, and Jira tickets.

---

## 🛠️ Build & Load in Brave / Chrome

```bash
bun install
bun run build
```

1. Open `brave://extensions/` (or `chrome://extensions/`).
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select:
   `.output/chrome-mv3`
4. Refresh [Discord Web](https://discord.com/channels/@me).

### Dev & Testing

```bash
bun run dev        # Hot-reload development build
bun run typecheck  # Strict TypeScript check
bun test           # Run unit tests
```
