const chatContainer = document.getElementById("chat-container");
const channelName = "quazy";
const MAX_MESSAGES = 25;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getEmoteUrl(emote) {
  const direct =
    emote?.image_url ||
    emote?.imageUrl ||
    emote?.url ||
    emote?.src ||
    emote?.fullsize ||
    emote?.fullsize_url ||
    emote?.full_size_url;

  if (direct) return direct;

  const nested =
    emote?.emote?.image_url ||
    emote?.emote?.imageUrl ||
    emote?.emote?.url ||
    emote?.emote?.src;

  if (nested) return nested;

  const id =
    emote?.id ||
    emote?.emote_id ||
    emote?.emoteId ||
    emote?.emote?.id;

  if (id) {
    return `https://files.kick.com/emotes/${id}/fullsize`;
  }

  return null;
}

function getEmoteName(emote) {
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

function renderMessageHtml(content, emotes = []) {
  const emoteMap = new Map();

  if (Array.isArray(emotes)) {
    for (const emote of emotes) {
      const name = getEmoteName(emote);
      const url = getEmoteUrl(emote);
      if (name && url) emoteMap.set(name, url);
    }
  }

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

function addMessage(username, messageHtml, color = "#00ff99") {
  const div = document.createElement("div");
  div.className = "chat-message";

  div.innerHTML = `
    <span class="username" style="color:${escapeHtml(color)}">${escapeHtml(username)}:</span>
    <span class="message">${messageHtml}</span>
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
    throw new Error(`Failed to get channel info: ${res.status}`);
  }

  const data = await res.json();
  return data?.chatroom?.id;
}

function normalizePayload(raw) {
  if (raw?.event === "App\\Events\\ChatMessageEvent") {
    return typeof raw.data === "string" ? JSON.parse(raw.data) : raw.data;
  }

  if (raw?.event === "ChatMessageSentEvent") {
    return typeof raw.data === "string" ? JSON.parse(raw.data) : raw.data;
  }

  return null;
}

async function connectToChat() {
  try {
    const chatroomId = await getChatroomId();
    if (!chatroomId) throw new Error("No chatroom id found");

    const socket = new WebSocket(
      "wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=7.6.0&flash=false"
    );

    socket.onopen = () => {
      socket.send(JSON.stringify({
        event: "pusher:subscribe",
        data: {
          auth: "",
          channel: `chatrooms.${chatroomId}.v2`
        }
      }));
    };

    socket.onmessage = (event) => {
      const raw = JSON.parse(event.data);

      if (raw?.event === "pusher:ping") {
        socket.send(JSON.stringify({ event: "pusher:pong", data: {} }));
        return;
      }

      const payload = normalizePayload(raw);
      if (!payload) return;

      console.log("KICK PAYLOAD:", payload);

      const username =
        payload?.sender?.username ||
        payload?.user?.username ||
        payload?.data?.user?.username ||
        "unknown";

      const color =
        payload?.sender?.identity?.color ||
        payload?.user?.identity?.color ||
        "#00ff99";

      const content =
        payload?.content ||
        payload?.message ||
        payload?.data?.message?.message ||
        "";

      const emotes =
        payload?.emotes ||
        payload?.message_emotes ||
        payload?.data?.message?.emotes ||
        [];

      const messageHtml = renderMessageHtml(content, emotes);

      addMessage(username, messageHtml, color);
    };

    socket.onerror = (e) => {
      console.error("WebSocket error", e);
    };

    socket.onclose = () => {
      console.log("Socket closed, retrying in 3s");
      setTimeout(connectToChat, 3000);
    };
  } catch (err) {
    console.error("Kick chat connection failed:", err);
    setTimeout(connectToChat, 5000);
  }
}

connectToChat();
