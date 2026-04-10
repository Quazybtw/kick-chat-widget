const chatContainer = document.getElementById("chat-container");
const channelName = "quazy";
const MAX_MESSAGES = 25;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function emoteUrlFromAny(emote) {
  if (!emote || typeof emote !== "object") return null;

  const direct =
    emote.image_url ||
    emote.imageUrl ||
    emote.url ||
    emote.src ||
    emote.fullsize ||
    emote.full_size_url ||
    emote.fullsize_url;

  if (direct) return direct;

  const nested =
    emote.emote?.image_url ||
    emote.emote?.imageUrl ||
    emote.emote?.url ||
    emote.emote?.src;

  if (nested) return nested;

  const id =
    emote.id ||
    emote.emote_id ||
    emote.emoteId ||
    emote.emote?.id;

  if (id) {
    return `https://files.kick.com/emotes/${id}/fullsize`;
  }

  return null;
}

function emoteNameFromAny(emote) {
  return (
    emote?.name ||
    emote?.slug ||
    emote?.code ||
    emote?.shortcut ||
    emote?.text ||
    emote?.emote?.name ||
    emote?.emote?.slug ||
    null
  );
}

function badgeUrlFromAny(badge) {
  return (
    badge?.image ||
    badge?.image_url ||
    badge?.src ||
    badge?.small_image_url ||
    badge?.badge_image?.src ||
    badge?.badge_image?.url ||
    null
  );
}

function renderBadges(badges) {
  if (!Array.isArray(badges) || badges.length === 0) return "";

  return badges
    .map((badge) => {
      const url = badgeUrlFromAny(badge);
      if (!url) return "";
      const alt = escapeHtml(badge?.text || badge?.type || "badge");
      return `<img class="chat-badge" src="${url}" alt="${alt}" title="${alt}">`;
    })
    .join("");
}

function buildEmoteMap(emotes) {
  const map = new Map();

  if (!Array.isArray(emotes)) return map;

  for (const emote of emotes) {
    const name = emoteNameFromAny(emote);
    const url = emoteUrlFromAny(emote);
    if (!name || !url) continue;
    map.set(name, url);
  }

  return map;
}

function renderFromContentTokens(content, emoteMap) {
  const tokens = String(content || "").split(/(\s+)/);

  return tokens
    .map((token) => {
      if (emoteMap.has(token)) {
        const src = emoteMap.get(token);
        const alt = escapeHtml(token);
        return `<img class="chat-emote" src="${src}" alt="${alt}" title="${alt}">`;
      }

      return `<span class="message-fragment">${escapeHtml(token)}</span>`;
    })
    .join("");
}

function renderFromFragments(parts) {
  if (!Array.isArray(parts) || parts.length === 0) return "";

  const rendered = parts
    .map((part) => {
      const type = (part?.type || part?.kind || "").toLowerCase();

      if (type.includes("emote")) {
        const src = emoteUrlFromAny(part);
        const alt = escapeHtml(emoteNameFromAny(part) || "emote");
        if (!src) return "";
        return `<img class="chat-emote" src="${src}" alt="${alt}" title="${alt}">`;
      }

      const text =
        part?.text ??
        part?.content ??
        part?.value ??
        part?.message ??
        "";

      return `<span class="message-fragment">${escapeHtml(text)}</span>`;
    })
    .join("");

  return rendered;
}

function renderMessageHtml(msg) {
  const content =
    msg?.content ??
    msg?.message ??
    msg?.data?.message?.message ??
    "";

  const fragmentCandidates = [
    msg?.parts,
    msg?.fragments,
    msg?.message_parts,
    msg?.tokens,
    msg?.data?.message?.parts,
    msg?.data?.message?.fragments
  ];

  for (const parts of fragmentCandidates) {
    const html = renderFromFragments(parts);
    if (html) return html;
  }

  const emoteCandidates = [
    msg?.emotes,
    msg?.message_emotes,
    msg?.data?.message?.emotes
  ];

  for (const emotes of emoteCandidates) {
    const emoteMap = buildEmoteMap(emotes);
    if (emoteMap.size > 0) {
      return renderFromContentTokens(content, emoteMap);
    }
  }

  return `<span class="message-fragment">${escapeHtml(content)}</span>`;
}

function addMessage(payload) {
  const username =
    payload?.sender?.username ||
    payload?.user?.username ||
    payload?.data?.user?.username ||
    "unknown";

  const color =
    payload?.sender?.identity?.color ||
    payload?.user?.identity?.color ||
    "#00ff99";

  const badges =
    payload?.sender?.identity?.badges ||
    payload?.user?.identity?.badges ||
    [];

  const messageHtml = renderMessageHtml(payload);
  const badgesHtml = renderBadges(badges);

  const div = document.createElement("div");
  div.className = "chat-message";

  div.innerHTML = `
    ${badgesHtml ? `<span class="chat-badges">${badgesHtml}</span>` : ""}
    <span class="chat-main">
      <span class="username" style="color:${escapeHtml(color)}">${escapeHtml(username)}:</span>
      <span class="message">${messageHtml}</span>
    </span>
  `;

  chatContainer.prepend(div);

  while (chatContainer.children.length > MAX_MESSAGES) {
    chatContainer.removeChild(chatContainer.lastChild);
  }
}

async function getChatroomId() {
  const res = await fetch(`https://kick.com/api/v2/channels/${channelName}`, {
    headers: { Accept: "application/json" }
  });

  if (!res.ok) {
    throw new Error(`Channel lookup failed: ${res.status}`);
  }

  const data = await res.json();
  const chatroomId = data?.chatroom?.id;

  if (!chatroomId) {
    throw new Error("No chatroom id found");
  }

  return chatroomId;
}

function normalizeIncomingEvent(raw) {
  if (raw?.event === "App\\Events\\ChatMessageEvent") {
    return typeof raw.data === "string" ? JSON.parse(raw.data) : raw.data;
  }

  if (raw?.event === "ChatMessageSentEvent") {
    return typeof raw.data === "string" ? JSON.parse(raw.data) : raw.data;
  }

  return null;
}

async function connectToKickChat() {
  try {
    const chatroomId = await getChatroomId();

    const ws = new WebSocket(
      "wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=7.6.0&flash=false"
    );

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          event: "pusher:subscribe",
          data: {
            auth: "",
            channel: `chatrooms.${chatroomId}.v2`
          }
        })
      );
    };

ws.onmessage = (event) => {
  const raw = JSON.parse(event.data);

  if (raw?.event === "pusher:ping") {
    ws.send(JSON.stringify({ event: "pusher:pong", data: {} }));
    return;
  }

  const payload = normalizeIncomingEvent(raw);
  if (!payload) return;

  console.log("MY CHAT PAYLOAD:", payload);

  addMessage(payload);
};

    ws.onerror = (err) => {
      console.error("Kick WebSocket error:", err);
    };

    ws.onclose = () => {
      console.warn("Kick WebSocket closed. Reconnecting in 3s...");
      setTimeout(connectToKickChat, 3000);
    };
  } catch (error) {
    console.error("Kick chat connection failed:", error);
    setTimeout(connectToKickChat, 5000);
  }
}

connectToKickChat();
