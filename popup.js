function setStatus(text, isError = false) {
  const el = document.getElementById('pop-status');
  el.textContent = text;
  el.style.color = isError ? '#f23f43' : '#23a55a';
  setTimeout(() => {
    el.textContent = '';
  }, 3000);
}

async function sendActionToContent(callback) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    setStatus('❌ Active tab not found', true);
    return;
  }
  if (!tab.url || !tab.url.includes('discord.com')) {
    setStatus('⚠️ Please open Discord Web', true);
    return;
  }

  chrome.tabs.sendMessage(tab.id, { action: 'extract' }, (response) => {
    if (chrome.runtime.lastError || !response) {
      setStatus('❌ Please refresh Discord page', true);
      return;
    }
    callback(response);
  });
}

document.getElementById('pop-copy-toon').addEventListener('click', () => {
  sendActionToContent((res) => {
    navigator.clipboard.writeText(res.toon).then(() => {
      setStatus(`✅ Copied ${res.count} msgs as TOON!`);
    });
  });
});

document.getElementById('pop-copy-json').addEventListener('click', () => {
  sendActionToContent((res) => {
    const jsonStr = JSON.stringify(res.messages, null, 2);
    navigator.clipboard.writeText(jsonStr).then(() => {
      setStatus(`✅ Copied ${res.count} msgs as JSON!`);
    });
  });
});

document.getElementById('pop-copy-md').addEventListener('click', () => {
  sendActionToContent((res) => {
    const md = res.messages.map(m => {
      let attachMd = '';
      if (m.attachments && m.attachments.length) {
        attachMd = '\n' + m.attachments.map(att => `![attachment](${att})`).join('\n');
      }
      let replyMd = m.reply_to ? `> Replying to ${m.reply_to}\n` : '';
      return `### [${m.author}](${m.link}) - *${m.time}*\n${replyMd}${m.content}${attachMd}\n`;
    }).join('\n---\n\n');

    navigator.clipboard.writeText(md).then(() => {
      setStatus(`✅ Copied ${res.count} msgs as Markdown!`);
    });
  });
});
