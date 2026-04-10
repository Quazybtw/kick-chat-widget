const chatContainer = document.getElementById("chat-container");
const channelName = "quazy";
const MAX_MESSAGES = 25;

const badgeUrls = {
  broadcaster: "https://assets.kickbotcdn.com/kick_badges/broadcaster.svg",
  founder: "https://assets.kickbotcdn.com/kick_badges/founder.svg",
  moderator: "https://assets.kickbotcdn.com/kick_badges/moderator.svg",
  og: "https://assets.kickbotcdn.com/kick_badges/og.svg",
  staff: "https://assets.kickbotcdn.com/kick_badges/staff.svg",
  subscriber: "https://assets.kickbotcdn.com/kick_badges/subscriber.svg",
  verified: "https://assets.kickbotcdn.com/kick_badges/verified.svg",
  vip: "https://assets.kickbotcdn.com/kick_badges/vip.svg",
  sub_gifter: "https://assets.kickbotcdn.com/kick_badges/subgifter.svg"
};

const bots = [
  "kickbot",
  "botrix",
  "aerokick",
  "kicklet",
  "notibot",
  "casterlabs",
  "logibot",
  "babzbot",
  "squadbot",
  "intrx",
  "mrbeefbot",
  "babblechat"
];

let socket = null;
let subBadges = [];
let sevenTvEmotes = [];
const streamerInfo = {
  kick: {
    slug: channelName,
    user_id: null
  }
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function getChannelData() {
  const res = await fetch(`https://kick.com/api/v2/channels/${channelName}`, {
    headers: { Accept: "application/json" }
  });

  if (!res.ok) {
    throw new Error(`Failed to get channel info: ${res.status}`);
  }

  const data = await res.json();
  return data;
}

async function fetchSevenTvEmotes() {
  if (!streamerInfo.kick.user_id) return;

  try {
    const userResponse = fetch(
      `https://7tv.io/v3/users/kick/${streamerInfo.kick.user_id}`
    );
    const globalResponse = fetch(`https://7tv.io/v3/emote-sets/global`);

    const [userResponseResult, globalResponseResult] = await Promise.all([
      userResponse,
      globalResponse
    ]);

    let userEmotes = [];
    if (userResponseResult.ok) {
      const userData = await userResponseResult.json();
      userEmotes = userData.emote_set?.emotes || [];
    }

    let globalEmotes = [];
    if (globalResponseResult.ok) {
      const globalData = await globalResponseResult.json();
      globalEmotes = globalData.emotes || [];
    }

    const emotes = [...userEmotes, ...globalEmotes];
    sevenTvEmotes = [];

    emotes.forEach((emote) => {
      const file = emote?.data?.host?.files?.find((f) => f.name === "4x.webp");
      const hostUrl = emote?.data?.host?.url;
      if (file && hostUrl) {
        sevenTvEmotes.push({
          name: emote.name,
          url: `https:${hostUrl}/${file.name}`
        });
      }
    });
  } catch (error) {
    console.error("Error fetching 7TV emotes:", error);
  }
}

function renderKickAnd7TvEmotes(content) {
  let messageWithEmotes = String(content || "");

  messageWithEmotes = messageWithEmotes.replace(
    /\[(emote|emoji):(\w+):?[^\]]*\]/g,
    (match, type, id) => {
      const imageSrc = `https://files.kick.com/emotes/${id}/fullsize`;
      return `<img class="chat-emote" src="${imageSrc}" alt="${escapeHtml(id)}">`;
    }
  );

  if (sevenTvEmotes.length > 0) {
    sevenTvEmotes.forEach((emote) => {
      const escapedName = escapeRegExp(emote.name);
      const emoteRegex = new RegExp(`(^|\\s)${escapedName}(?=\\s|$)`, "g");
      messageWithEmotes = messageWithEmotes.replace(
        emoteRegex,
        `$1<img class="chat-emote" src="${emote.url}" alt="${escapeHtml(emote.name)}">`
      );
    });
  }

  return messageWithEmotes;
}

function buildBadgesHtml(sender) {
  const badges = sender?.identity?.badges || [];
  if (!badges.length) return "";

  const parts = [];

  badges.forEach((badge) => {
    let src = "";

    if (badge.type === "subscriber") {
      let subBadge = null;
      for (const badgeData of subBadges) {
        if (badgeData.months <= (badge.count || 0)) {
          subBadge = badgeData;
        } else {
          break;
        }
      }

      if (subBadge?.badge_image?.src) {
        src = subBadge.badge_image.src;
      } else if (subBadges.length === 0 && badgeUrls[badge.type]) {
        src = badgeUrls[badge.type];
      }
    } else if (badgeUrls[badge.type]) {
      src = badgeUrls[badge.type];
    }

    if (src) {
      parts.push(
        `<img class="chat-badge" src="${src}" alt="${escapeHtml(badge.type)}">`
      );
    }
  });

  return parts.join("");
}

function addMessage(eventData) {
  const username = eventData?.sender?.username || "unknown";
  const color = eventData?.sender?.identity?.color || "#00ff99";

  if (bots.includes(username.toLowerCase())) {
    return;
  }

  const renderedContent = renderKickAnd7TvEmotes(eventData?.content || "");
  if (!renderedContent.length) return;

  const badgesHtml = buildBadgesHtml(eventData.sender);

  const div = document.createElement("div");
  div.className = "chat-message";
  div.id = eventData.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const isTagged = renderedContent
    .toLowerCase()
    .includes(`@${streamerInfo.kick.slug.toLowerCase()}`);

  if (isTagged) {
    div.classList.add("highlighted-message");
  }

  div.innerHTML = `
    <span class="chat-badges">${badgesHtml}</span>
    <span class="username" style="color:${escapeHtml(color)}">${escapeHtml(username)}:</span>
    <span class="message">${renderedContent}</span>
  `;

  chatContainer.prepend(div);

  while (chatContainer.children.length > MAX_MESSAGES) {
    chatContainer.removeChild(chatContainer.lastChild);
  }

  setTimeout(() => {
    div.classList.add("fade-out");
    setTimeout(() => div.remove(), 750);
  }, 60000);
}

function removeMessageById(messageId) {
  const el = document.getElementById(messageId);
  if (el) el.remove();
}

function normalizeIncoming(raw) {
  if (raw?.event === "App\\Events\\ChatMessageEvent") {
    return {
      type: "chatMessageEvent",
      data: typeof raw.data === "string" ? JSON.parse(raw.data) : raw.data
    };
  }

  if (raw?.event === "App\\Events\\ChatMessageDeletedEvent") {
    return {
      type: "chatMessageDeletedEvent",
      data: typeof raw.data === "string" ? JSON.parse(raw.data) : raw.data
    };
  }

  return null;
}

async function connectToChat() {
  try {
    const channelData = await getChannelData();
    const chatroomId = channelData?.chatroom?.id;
    subBadges = channelData?.subscriber_badges || [];
    streamerInfo.kick.user_id = channelData?.user_id || channelData?.user?.id || null;

    await fetchSevenTvEmotes();

    if (!chatroomId) {
      throw new Error("No chatroom id found");
    }

    socket = new WebSocket(
      "wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=7.6.0&flash=false"
    );

    socket.addEventListener("open", () => {
      socket.send(
        JSON.stringify({
          event: "pusher:subscribe",
          data: {
            channel: `chatrooms.${chatroomId}.v2`
          }
        })
      );
    });

    socket.addEventListener("message", (event) => {
      const raw = JSON.parse(event.data);

      if (raw?.event === "pusher:ping") {
        socket.send(JSON.stringify({ event: "pusher:pong", data: {} }));
        return;
      }

      const normalized = normalizeIncoming(raw);
      if (!normalized) return;

      if (normalized.type === "chatMessageEvent") {
        addMessage(normalized.data);
      }

      if (normalized.type === "chatMessageDeletedEvent") {
        const messageId =
          normalized.data?.message?.id ||
          normalized.data?.id;
        if (messageId) removeMessageById(messageId);
      }
    });

    socket.addEventListener("close", () => {
      setTimeout(connectToChat, 5000);
    });

    socket.addEventListener("error", (err) => {
      console.error("WebSocket error:", err);
      socket.close();
    });
  } catch (err) {
    console.error("Kick chat connection failed:", err);
    setTimeout(connectToChat, 5000);
  }
}

connectToChat();
