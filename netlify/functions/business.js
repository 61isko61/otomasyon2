const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  const slug = event.queryStringParameters && event.queryStringParameters.slug;

  if (!slug) {
    return { statusCode: 400, body: JSON.stringify({ error: 'slug gerekli' }) };
  }

  try {
    const store = getStore('businesses');
    const data = await store.get(slug, { type: 'json' });

    if (!data) {
      return { statusCode: 404, body: JSON.stringify({ error: 'bulunamadı' }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify(data)
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: 'sunucu hatası' }) };
  }
};
