const chatContainer = document.getElementById("chat-container");
const channelName = "quazy";

function addMessage(username, message, color = "#00ff99") {
  const div = document.createElement("div");
  div.className = "chat-message";

  div.innerHTML = `
    <span class="username" style="color:${color}">${username}:</span>
    <span class="message">${message}</span>
  `;

  chatContainer.appendChild(div);

  if (chatContainer.children.length > 25) {
    chatContainer.removeChild(chatContainer.firstChild);
  }
}

async function getChatroomId() {
  const res = await fetch(`https://kick.com/api/v2/channels/${channelName}`, {
    headers: {
      "Accept": "application/json"
    }
  });

  if (!res.ok) {
    throw new Error(`Failed to get channel info: ${res.status}`);
  }

  const data = await res.json();
  return data?.chatroom?.id;
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

      if (raw.event === "pusher:ping") {
        socket.send(JSON.stringify({ event: "pusher:pong", data: {} }));
        return;
      }

      if (raw.event === "App\\Events\\ChatMessageEvent") {
        const msg = JSON.parse(raw.data);
        addMessage(
          msg?.sender?.username || "unknown",
          msg?.content || "",
          msg?.sender?.identity?.color || "#00ff99"
        );
        return;
      }

      if (raw.event === "ChatMessageSentEvent") {
        const payload = typeof raw.data === "string" ? JSON.parse(raw.data) : raw.data;
        addMessage(
          payload?.data?.user?.username || "unknown",
          payload?.data?.message?.message || "",
          "#00ff99"
        );
      }
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
  }
}

connectToChat();