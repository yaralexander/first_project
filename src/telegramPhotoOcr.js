async function downloadTelegramPhoto(fileId, { botToken, apiBaseUrl, callTelegramMethod, fetchImpl = fetch } = {}) {
  const file = await callTelegramMethod('getFile', { file_id: fileId });
  if (!file?.file_path || !/^[A-Za-z0-9_./-]+$/.test(file.file_path) || file.file_path.includes('..')) {
    throw new Error('Telegram не вернул безопасный путь к фотографии.');
  }
  const response = await fetchImpl(`${apiBaseUrl}/file/bot${botToken}/${file.file_path}`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Не удалось загрузить фотографию из Telegram.');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 10 * 1024 * 1024) throw new Error('Фотография слишком большая.');
  return { bytes, mimeType: response.headers.get('content-type') || 'image/jpeg' };
}

async function recognizeHslStopCode(image, { apiKey, model = 'gpt-5-nano', fetchImpl = fetch } = {}) {
  if (!apiKey) return '';
  const dataUrl = `data:${image.mimeType};base64,${image.bytes.toString('base64')}`;
  const response = await fetchImpl('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      max_completion_tokens: 40,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Найди на фото код остановки HSL (например H1234, E1234, V1234 или 1234). Ответь только кодом. Если кода не видно, ответь NONE.' },
          { type: 'image_url', image_url: { url: dataUrl, detail: 'low' } },
        ],
      }],
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`OpenAI OCR вернул ошибку ${response.status}.`);
  const payload = await response.json();
  const text = String(payload.choices?.[0]?.message?.content || '').trim().toUpperCase();
  const match = /\b([A-ZÅÄÖ]{0,2}\d{3,7})\b/u.exec(text);
  return match ? match[1] : '';
}

module.exports = { downloadTelegramPhoto, recognizeHslStopCode };
