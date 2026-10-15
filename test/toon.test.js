const { serializeToon, parseToon } = require('../toon.js');

const sampleMessages = [
  {
    id: "134567890123456789",
    author: "Raneem Alashry",
    time: "2026-10-14 14:21:00",
    link: "https://discord.com/channels/123/456/134567890123456789",
    reply_to: null,
    attachments: ["https://cdn.discordapp.com/attachments/123/456/img1.png"],
    content: "الرسالة بتظهر مقروءة علطول أول ما تتبعت حتى لو مقفول الشات"
  },
  {
    id: "134567890123456790",
    author: "Adham",
    time: "2026-10-14 14:25:00",
    link: "https://discord.com/channels/123/456/134567890123456790",
    reply_to: "Raneem Alashry: الرسالة بتظهر مقروءة علطول",
    attachments: null,
    content: "تمام هراجع كود الـ client في SeenMessengerService.ts"
  }
];

console.log("=== Original Data ===");
console.log(JSON.stringify(sampleMessages, null, 2));

console.log("\n=== Serialized TOON ===");
const toonStr = serializeToon(sampleMessages, ['id', 'author', 'time', 'link', 'reply_to', 'attachments', 'content']);
console.log(toonStr);

console.log("\n=== Parsed back from TOON ===");
const parsed = parseToon(toonStr);
console.log(JSON.stringify(parsed, null, 2));

if (parsed.length === sampleMessages.length && parsed[0].author === sampleMessages[0].author) {
  console.log("\n✅ TOON Serialization & Deserialization Test Passed!");
} else {
  console.error("\n❌ TOON Test Failed!");
  process.exit(1);
}
