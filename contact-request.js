exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'method not allowed' };
  }

  try {
    const { name, business, phone, message } = JSON.parse(event.body || '{}');

    if (!name || !phone) {
      return { statusCode: 400, body: JSON.stringify({ error: 'eksik veri' }) };
    }

    // Bildirimlerin gideceği herkesin chat ID'sini buraya ekleyin.
    // Yeni birini eklemek için virgülle ayırıp bir satır daha yazmanız yeterli.
    const NOTIFY_CHAT_IDS = [
      '6158240799',
      // '123456789', // arkadaşının chat ID'si buraya
    ];

    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

    const text =
      `🆕 Yeni talep — rovera.com.tr\n\n` +
      `👤 Ad: ${name}\n` +
      `🏪 İşletme: ${business || '-'}\n` +
      `📞 Telefon: ${phone}\n` +
      `💬 Mesaj: ${message || '-'}`;

    const results = await Promise.all(
      NOTIFY_CHAT_IDS.map((chatId) =>
        fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text })
        })
      )
    );

    if (!results.some((r) => r.ok)) {
      return { statusCode: 502, body: JSON.stringify({ error: 'gönderilemedi' }) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: 'hata' }) };
  }
};
