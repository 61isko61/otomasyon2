const { getStore } = require('@netlify/blobs');

// Sadece bu Telegram hesabı botu kullanabilir.
const ADMIN_CHAT_ID = '6158240799';

const MAIN_MENU = {
  inline_keyboard: [[{ text: '➕ Yeni İşletme Ekle', callback_data: 'new_business' }]]
};

function slugify(text) {
  const map = { ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ı: 'i', İ: 'i', ö: 'o', Ö: 'o', ş: 's', Ş: 's', ü: 'u', Ü: 'u' };
  return text
    .split('')
    .map((ch) => map[ch] || ch)
    .join('')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function sendMessage(botToken, chatId, text, replyMarkup) {
  const body = { chat_id: chatId, text };
  if (replyMarkup) body.reply_markup = replyMarkup;
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

async function answerCallback(botToken, callbackQueryId) {
  await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId })
  });
}

exports.handler = async (event) => {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

  try {
    const update = JSON.parse(event.body || '{}');
    const businesses = getStore('businesses');
    const sessions = getStore('admin-sessions');

    // --- "➕ Yeni İşletme Ekle" butonuna tıklandığında ---
    if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = String(cq.message.chat.id);
      await answerCallback(BOT_TOKEN, cq.id);

      if (chatId !== ADMIN_CHAT_ID) {
        return { statusCode: 200, body: 'ok' };
      }

      if (cq.data === 'new_business') {
        await sessions.setJSON(chatId, { step: 'name', data: {} });
        await sendMessage(BOT_TOKEN, chatId, '🏪 Yeni işletmenin adı nedir?');
      }

      return { statusCode: 200, body: 'ok' };
    }

    // --- Yazılı mesaj ---
    const message = update.message;
    if (!message || !message.text) {
      return { statusCode: 200, body: 'ok' };
    }

    const chatId = String(message.chat.id);
    const text = message.text.trim();

    if (chatId !== ADMIN_CHAT_ID) {
      await sendMessage(BOT_TOKEN, chatId, 'Bu botu kullanma yetkin yok.');
      return { statusCode: 200, body: 'ok' };
    }

    let session = null;
    try {
      session = await sessions.get(chatId, { type: 'json' });
    } catch (e) {
      session = null;
    }

    // --- Devam eden "yeni işletme ekle" akışı ---
    if (session && text === '/iptal') {
      await sessions.delete(chatId);
      await sendMessage(BOT_TOKEN, chatId, 'İptal edildi.', MAIN_MENU);
      return { statusCode: 200, body: 'ok' };
    }

    if (session) {
      if (session.step === 'name') {
        session.data.name = text;
        session.step = 'google';
        await sessions.setJSON(chatId, session);
        await sendMessage(
          BOT_TOKEN,
          chatId,
          '⭐ Google yorum linki nedir?\n(business.google.com > Yorumlar > "Daha fazla yorum al" ile alabilirsin)'
        );
      } else if (session.step === 'google') {
        session.data.googleReviewUrl = text;
        session.step = 'telegram';
        await sessions.setJSON(chatId, session);
        await sendMessage(
          BOT_TOKEN,
          chatId,
          "📲 Bu işletmenin geri bildirimleri hangi Telegram'a düşsün?\nKendi chat ID'ni yaz, ya da işletme sahibinin chat ID'sini yaz."
        );
      } else if (session.step === 'telegram') {
        session.data.telegramChatId = text;
        const baseSlug = slugify(session.data.name) || 'isletme-' + Date.now();

        let slug = baseSlug;
        let existing = null;
        try {
          existing = await businesses.get(slug, { type: 'json' });
        } catch (e) {
          existing = null;
        }

        if (existing) {
          // Aynı isimden zaten var — üzerine yazmak yerine benzersiz bir slug üret.
          let counter = 2;
          while (existing) {
            slug = `${baseSlug}-${counter}`;
            try {
              existing = await businesses.get(slug, { type: 'json' });
            } catch (e) {
              existing = null;
            }
            counter++;
          }
        }

        await businesses.setJSON(slug, {
          name: session.data.name,
          googleReviewUrl: session.data.googleReviewUrl,
          telegramChatId: session.data.telegramChatId
        });
        await sessions.delete(chatId);

        const noteIfRenamed = slug !== baseSlug ? `\n⚠️ Bu isimde zaten bir işletme vardı, link "${slug}" olarak ayarlandı.` : '';

        await sendMessage(
          BOT_TOKEN,
          chatId,
          `✅ Eklendi: ${session.data.name}\n🔗 Link: rovera.com.tr/yorum/?isletme=${slug}${noteIfRenamed}`,
          MAIN_MENU
        );
      }
      return { statusCode: 200, body: 'ok' };
    }

    // --- Komutlar ---
    if (text === '/start' || text === '/menu') {
      await sendMessage(BOT_TOKEN, chatId, 'Merhaba! Yeni bir işletme eklemek için aşağıdaki butonu kullan.', MAIN_MENU);
    } else if (text === '/liste' || text === '/list') {
      const { blobs } = await businesses.list();
      if (blobs.length === 0) {
        await sendMessage(BOT_TOKEN, chatId, 'Henüz işletme yok.', MAIN_MENU);
      } else {
        const lines = [];
        for (const b of blobs) {
          const data = await businesses.get(b.key, { type: 'json' });
          lines.push(`• ${data.name} — ${b.key}`);
        }
        await sendMessage(BOT_TOKEN, chatId, 'İşletmeler:\n' + lines.join('\n'), MAIN_MENU);
      }
    } else if (text.startsWith('/sil ')) {
      const slug = text.slice(5).trim();
      await businesses.delete(slug);
      await sendMessage(BOT_TOKEN, chatId, `🗑️ Silindi: ${slug}`, MAIN_MENU);
    } else {
      await sendMessage(
        BOT_TOKEN,
        chatId,
        'Yeni işletme eklemek için aşağıdaki butonu kullan.\nDiğer komutlar: /liste, /sil slug',
        MAIN_MENU
      );
    }

    return { statusCode: 200, body: 'ok' };
  } catch (err) {
    return { statusCode: 200, body: 'ok' };
  }
};
