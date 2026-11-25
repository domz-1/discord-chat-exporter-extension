# Discord Chat Exporter Extension (WXT · Chrome / Brave / Firefox)

A **WXT + TypeScript** browser extension with a **Liquid Glass** UI to multi-select, batch-forward, and export Discord messages, threads, replies, and attachments into **TOON** (Token-Oriented Object Notation), **JSON**, and **Markdown** — plus hide muted channels and DMs completely.

## ✨ Features

- **Multi-Select Messages**: Hover any message to toggle its glass checkbox, or `Shift+Click` for range selection. Scroll-safe in-memory cache preserves selections across Discord's virtualized scroll list and exports in chronological snowflake order.
- **Native Multi-Forward**: Click **Forward Selected** to open Discord's own native **Forward To** modal and forward all selected messages in chronological order via Discord's real `message_reference` (`type: 1`) flow.
- **Minimal Hover-Only Liquid Glass Dock**: Collapses to a subtle `14px` translucent pearl dot in the bottom-right corner and blooms into the full Liquid Glass panel only when hovered.
- **Hide Muted Channels & DMs**: Automatically hides muted server channels, muted categories, and muted Direct Messages / Group DMs (with a synced toggle in both the dock and popup).
- **TOON / JSON / Markdown Export**: Saves 30%–60% LLM tokens with TOON serialization for bug audits and Jira tickets.

---

## 🛠️ Development & Build (WXT)

```bash
bun install
bun run dev        # Hot-reload development build
bun run build      # Production build -> .output/chrome-mv3
bun run typecheck  # Strict TypeScript check
bun test           # Run unit tests
```

---

## 📦 How to Load in Brave / Chrome

1. Run `bun run build`.
2. Open `brave://extensions/` (or `chrome://extensions/`).
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select:
   `/home/adham/projects/adham/discord-chat-exporter-extension/.output/chrome-mv3`
5. Refresh [Discord Web](https://discord.com/channels/@me).

---

## 📁 Project Structure

```text
src/
├── entrypoints/
│   ├── discord-bridge.content.ts  # MAIN-world hook for native multi-forward
│   ├── content.ts                 # Isolated content script (UI, selection, muted filter)
│   └── popup/                     # Liquid Glass extension popup
├── lib/
│   ├── extractor.ts               # Message parser, snowflake sort, Markdown formatter
│   ├── forward.ts                 # Discord Forward payload & snowflake nonce helpers
│   ├── muted.ts                   # Muted channels, categories & DMs detector/observer
│   ├── storage.ts                 # Synced browser.storage helpers
│   ├── toon.ts                    # TOON serializer & parser
│   └── types.ts                   # Shared TypeScript interfaces
└── ui/
    ├── content.css                # Liquid Glass styles + muted channel hiding rules
    ├── dock.ts                    # Tiny glass dot -> hover expandable dock
    └── selection.ts               # Multi-select checkboxes & scroll-safe cache
```
