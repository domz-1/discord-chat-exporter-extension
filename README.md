# Discord Chat Exporter Extension (Chrome / Brave / Firefox)

A browser extension to extract Discord messages, threads, replies, and attachments into **TOON** (Token-Oriented Object Notation), **JSON**, and **Markdown**.

## 🚀 Why TOON?
LLMs consume tokens for repetitive JSON keys (`"id": ...`, `"author": ...`, `"content": ...`). 
**TOON** declares keys once at the top:
```text
[count]{id,author,time,link,reply_to,attachments,content}:
val1,val2,val3,...
```
This saves **30% to 60% of tokens**, allowing you to feed whole Discord bug reports and QA chats directly to Antigravity agents without blowing context limits.

---

## 📦 How to Install in Chrome / Brave

1. Open your browser and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right).
3. Click **Load unpacked**.
4. Select the folder:
   `/home/adham/projects/adham/discord-chat-exporter-extension`
5. Open any Discord chat on [Discord Web](https://discord.com/channels/@me).
6. You will see a floating **⚡ Discord Exporter** widget in the bottom right corner with buttons:
   - **📋 Copy TOON**: Copies compact representation to clipboard.
   - **📦 Copy JSON**: Copies standard JSON array.
   - **📝 Copy MD**: Copies formatted Markdown list.

---

## 🛠️ Antigravity Skill Integration
This extension pairs with the Antigravity skill:
`discord-to-jira-bugs` at `/home/adham/.agents/skills/discord-to-jira-bugs/SKILL.md`.

Paste the copied TOON directly into Antigravity to convert Discord QA bug discussions into audited Jira tickets!
