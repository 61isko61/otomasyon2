exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'method not allowed' };
  }

  try {
    const { chatId, text, businessName, complaint } = JSON.parse(event.body || '{}');
    if (!chatId || !text) {
      return { statusCode: 400, body: 'eksik veri' };
    }

    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

    let customerReply = 'Geri bildiriminiz bizim için çok değerli, teşekkür ederiz. En kısa sürede sizinle iletişime geçilecek.';

    // Yapay zeka anahtarı tanımlıysa, işletmenin kendisi cevap yazmış gibi
    // kişisel bir mesaj üret ve doğrudan müşteriye göster.
    if (ANTHROPIC_API_KEY && complaint) {
      try {
        const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-5',
            max_tokens: 250,
            system:
              `Sen "${businessName || 'işletme'}" adlı işletmenin sahibisin, müşteriye BİZZAT SEN cevap yazıyorsun. ` +
              'Müşterinin yaşadığı sorunu anlayıp, samimi, sıcak ve gerçek bir insan gibi (yapay zeka olduğunu asla belli etmeden) ' +
              'kısa bir cevap yaz (2-3 cümle). Özür dile, şikayeti ciddiye aldığını göster, gerekiyorsa telafi edeceğini belirt. ' +
              'Abartılı veya kurumsal dilden kaçın, doğal ve sıcak bir ton kullan. Türkçe yaz. ' +
              'SADECE cevabın kendisini yaz, başka hiçbir açıklama, tırnak işareti veya etiket ekleme.',
            messages: [
              { role: 'user', content: `Müşterinin şikayeti: ${complaint}` }
            ]
          })
        });

        if (aiRes.ok) {
          const data = await aiRes.json();
          const raw = data.content && data.content[0] && data.content[0].text ? data.content[0].text : '';
          const cleaned = raw.trim();
          if (cleaned) customerReply = cleaned;
        }
      } catch (aiErr) {
        // Yapay zeka başarısız olursa sessizce varsayılan mesaja düşülür,
        // geri bildirim akışı bu yüzden kesilmez.
      }
    }

    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text })
    });

    if (!res.ok) {
      return { statusCode: 502, body: 'gönderilemedi' };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, customerReply })
    };
  } catch (err) {
    return { statusCode: 500, body: 'hata' };
  }
};
