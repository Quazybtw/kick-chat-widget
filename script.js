const badge_urls = {
  broadcaster: 'https://assets.kickbotcdn.com/kick_badges/broadcaster.svg',
  founder: 'https://assets.kickbotcdn.com/kick_badges/founder.svg',
  moderator: 'https://assets.kickbotcdn.com/kick_badges/moderator.svg',
  og: 'https://assets.kickbotcdn.com/kick_badges/og.svg',
  staff: 'https://assets.kickbotcdn.com/kick_badges/staff.svg',
  subscriber: 'https://assets.kickbotcdn.com/kick_badges/subscriber.svg',
  verified: 'https://assets.kickbotcdn.com/kick_badges/verified.svg',
  vip: 'https://assets.kickbotcdn.com/kick_badges/vip.svg',
  sub_gifter: 'https://assets.kickbotcdn.com/kick_badges/subgifter.svg'
};

let seven_tv_emotes = [];

async function fetchSevenTvEmotes() {
  try {
    const userResponse = fetch(
      `https://7tv.io/v3/users/kick/${globalValues.streamerInfo.kick.user_id}`
    );
    const globalResponse = fetch(`https://7tv.io/v3/emote-sets/global`);
    const [userResponseResult, globalResponseResult] = await Promise.all([
      userResponse,
      globalResponse,
    ]);

    let userEmotes = [];
    if (userResponseResult.ok) {
      const userData = await userResponseResult.json();
      userEmotes = userData.emote_set?.emotes || [];
    } else {
      console.warn(`User emotes not found: ${userResponseResult.status}`);
    }

    const globalData = await globalResponseResult.json();
    const globalEmotes = globalData.emotes || [];

    const emotes = [...userEmotes, ...globalEmotes];

    emotes.forEach((emote) => {
      if (emote.data.host && emote.data.host.files) {
        const file = emote.data.host.files.find(
          (file) => file.name === '4x.webp'
        );
        if (file) {
          const emoteUrl = `https:${emote.data.host.url}/${file.name}`;
          seven_tv_emotes.push({ name: emote.name, url: emoteUrl });
        }
      }
    });
  } catch (error) {
    console.error('Error fetching 7TV emotes:', error);
  }
}

fetchSevenTvEmotes();

let message_content;
let current_message_count = 0;

const font_size = userVariables.font_size.value;
const text_color = userVariables.text_color.value;
const show_badges = userVariables.show_badges.value;
const highlight_tagged = userVariables.highlight_tagged.value;
const show_bots = userVariables.show_bots.value;
const show_emotes = userVariables.show_emotes.value;
const text_shadow = userVariables.text_shadow.value;
const remove_old = userVariables.remove_old.value;
const remove_old_time = userVariables.remove_old_time.value;

const widget_root = document.documentElement;

widget_root.style.setProperty('--font-size', font_size + 'px');
widget_root.style.setProperty('--font-color', text_color);

if (!text_shadow) {
  widget_root.style.setProperty('--text-shadow', 'none');
} else {
  widget_root.style.setProperty(
    '--text-shadow',
    `
    0.04em 0 0 #000,
    0 0.04em 0 #000,
    -0.04em 0 0 #000,
    0 -0.04em 0 #000,
    0.04em 0.04em 0 #000,
    -0.04em 0.04em 0 #000,
    0.04em -0.04em 0 #000,
    -0.04em -0.04em 0 #000,
    0.08em 0.08em 0.04em rgba(0, 0, 0, 0.3)
  `
  );
}

const bots = [
  'kickbot',
  'botrix',
  'aerokick',
  'kicklet',
  'notibot',
  'casterlabs',
  'logibot',
  'babzbot',
  'squadbot',
  'intrx',
  'mrbeefbot',
  'babblechat',
];

const chat_container = document.getElementById('chat');
document.addEventListener('widgetEvent', handleWidgetEvent);

let subBadges = globalValues.streamerInfo.kick.subscriber_badges;

const event_handlers = {
  chatMessageEvent: (event) => handleChatMessage(event.data),
  chatMessageDeletedEvent: (event) =>
    handleMessageDelete(event.data.message.id),
};

for (let i = 0; i < globalValues.chatMessages.length; i++) {
  handleChatMessage(globalValues.chatMessages[i]);
}

function handleWidgetEvent(event) {
  try {
    const handler = event_handlers[event.detail.event_name];
    if (handler) {
      handler(event.detail);
    }
  } catch (e) {
    console.error('Error on widget event', e);
  }
}

function handleChatMessage(event_data) {
  if (!show_bots && bots.includes(event_data.sender.username.toLowerCase())) {
    return;
  }

  if (show_emotes) {
    let message_with_emotes = event_data.content.replace(
      /\[(emote|emoji):(\w+):?[^\]]*\]/g,
      (match, type, id) => {
        const image_src = `https://files.kick.com/emotes/${id}/fullsize`;
        return `<img src="${image_src}" alt="${id}">`;
      }
    );

    function escapeRegExp(string) {
      return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  
    if (seven_tv_emotes.length > 0) {
      seven_tv_emotes.forEach((emote) => {
        const escaped_emote_name = escapeRegExp(emote.name);
        const emote_regex = new RegExp(`(^|\\s)${escaped_emote_name}(?=\\s|$)`, 'g');
        message_with_emotes = message_with_emotes.replace(
          emote_regex,
          `$1<img src="${emote.url}" alt="${emote.name}">`
        );
      });
      message_content = message_with_emotes;
    } else {
      message_content = message_with_emotes;
    }
  } else {
    message_content = event_data.content.replace(
      /\[(emote|emoji):(\w+):?[^\]]*\]/g,
      ''
    );
  }


  const message_element = document.createElement('div');
  message_element.id = event_data.id;
  message_element.className = 'chat-message';

  const badges_span = document.createElement('span');
  const username_span = document.createElement('span');
  const message_span = document.createElement('span');

  username_span.className = 'chat-username';
  message_span.className = 'chat-message-content';
  badges_span.className = 'chat-badges';

  if (
    highlight_tagged &&
    message_content
      .toLowerCase()
      .includes(`@${globalValues.streamerInfo.kick.slug.toLowerCase()}`)
  ) {
    message_element.classList.add('highlighted-message');
  }

  if (message_content.length === 0) {
    return;
  }

  username_span.textContent = `${event_data.sender.username}:`;
  username_span.style.color = event_data.sender.identity.color;
  message_span.innerHTML = message_content;

  if (show_badges && event_data.sender.identity.badges.length > 0) {
    event_data.sender.identity.badges.forEach((badge) => {
      const badge_img_el = document.createElement('img');
      if (badge.type === 'subscriber') {
        let sub_badge = null;
        for (let badge_data of subBadges) {
          if (badge_data.months <= (badge.count || 0)) {
            sub_badge = badge_data;
          } else {
            break;
          }
        }
        if (sub_badge) {
          badge_img_el.src = sub_badge.badge_image.src;
        } else if (subBadges.length === 0) {
          badge_img_el.src = badge_urls[badge.type];
        }
      } else if (badge_urls.hasOwnProperty(badge.type)) {
        badge_img_el.src = badge_urls[badge.type];
      }
      badges_span.appendChild(badge_img_el);
    });
  }

  message_element.appendChild(badges_span);
  message_element.appendChild(username_span);
  message_element.appendChild(message_span);
  chat_container.appendChild(message_element);

  if (chat_container.children.length > 100) {
    chat_container.firstChild.remove();
    current_message_count--;
  }

  setTimeout(() => {
    handleMessageFade(event_data.id);
  }, remove_old_time * 1000);
}

function handleMessageFade(chat_message_id) {
  if (remove_old) {
    const message_element = document.getElementById(chat_message_id);
    message_element.classList.add('fade-out');
    setTimeout(() => {
      message_element.remove();
    }, 750);
  }
}

function handleMessageDelete(chat_message_id) {
  const message_element = document.getElementById(chat_message_id);
  if (chat_container && message_element) {
    chat_container.removeChild(message_element);
  }
}
