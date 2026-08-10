const RUSSIAN_BOT_COMMANDS = Object.freeze([
  { command: 'hsl', description: 'Расписание транспорта HSL' },
  { command: 'start', description: 'Подключить персональную рассылку' },
  { command: 'settings', description: 'Открыть настройки рассылки' },
  { command: 'chatid', description: 'Показать ID этого Telegram-чата' },
  { command: 'help', description: 'Показать инструкцию' },
]);

const RUSSIAN_BOT_DESCRIPTION = [
  'Персональная рассылка «Финских Новостей» и расписание транспорта HSL.',
  'Получайте выбранные новости или найдите отправления по номеру остановки и геопозиции.',
].join(' ');

const RUSSIAN_BOT_SHORT_DESCRIPTION = 'Новости Финляндии и расписание транспорта HSL на русском языке.';

async function configureRussianTelegramBot(callMethod) {
  const localizedSettings = [
    ['setMyCommands', { commands: RUSSIAN_BOT_COMMANDS }],
    ['setMyDescription', { description: RUSSIAN_BOT_DESCRIPTION }],
    ['setMyShortDescription', { short_description: RUSSIAN_BOT_SHORT_DESCRIPTION }],
    ['setMyCommands', { commands: RUSSIAN_BOT_COMMANDS, language_code: 'ru' }],
    ['setMyDescription', { description: RUSSIAN_BOT_DESCRIPTION, language_code: 'ru' }],
    ['setMyShortDescription', { short_description: RUSSIAN_BOT_SHORT_DESCRIPTION, language_code: 'ru' }],
  ];

  for (const [method, body] of localizedSettings) {
    await callMethod(method, body);
  }
}

function getTelegramWebhookUrl(siteUrl) {
  try {
    const url = new URL(siteUrl);
    if (url.protocol !== 'https:') return '';
    return `${url.origin}/telegram/webhook`;
  } catch {
    return '';
  }
}

async function configureTelegramWebhook(callMethod, { siteUrl, secret = '' } = {}) {
  const url = getTelegramWebhookUrl(siteUrl);
  if (!url) return { configured: false, reason: 'https-required' };

  const body = {
    url,
    allowed_updates: ['message'],
    drop_pending_updates: false,
  };
  if (secret) body.secret_token = secret;

  await callMethod('setWebhook', body);
  return { configured: true, url };
}

function getRussianTelegramReply(text, { accountUrl, linkSucceeded = false, chatId = '' } = {}) {
  const normalizedText = String(text || '').trim();
  const accountLink = String(accountUrl || '').replace(/\/$/, '') + '/account';
  const startMatch = /^\/start(?:@[A-Za-z0-9_]{5,32})?(?:\s+([A-Za-z0-9_-]{8,64}))?$/i.exec(normalizedText);

  if (startMatch && startMatch[1]) {
    if (linkSucceeded) {
      return [
        '✅ Telegram подключён к вашему личному кабинету.',
        'Теперь выберите темы, частоту и сохраните настройки рассылки:',
        accountLink,
      ].join('\n\n');
    }
    return [
      'Этот код подключения недействителен или уже истёк.',
      'Получите новый код в личном кабинете и нажмите кнопку подключения ещё раз:',
      accountLink,
    ].join('\n\n');
  }

  if (startMatch || /^\/help(?:@[A-Za-z0-9_]{5,32})?$/i.test(normalizedText)) {
    return [
      'Здравствуйте! Это бот «Финские Новости». 🇫🇮',
      'Он отправляет персональную подборку новостей на русском языке.',
      'Команда /hsl показывает расписание транспорта по номеру остановки или геопозиции.',
      'Чтобы подключить рассылку, войдите в личный кабинет и нажмите «Подключить Telegram». Имя канала вводить не нужно.',
      accountLink,
    ].join('\n\n');
  }

  if (/^\/settings(?:@[A-Za-z0-9_]{5,32})?$/i.test(normalizedText)) {
    return `Настройки тем и частоты рассылки находятся в личном кабинете:\n\n${accountLink}`;
  }

  if (/^\/chatid(?:@[A-Za-z0-9_]{5,32})?$/i.test(normalizedText)) {
    return `ID этого Telegram-чата: ${chatId || 'не определён'}`;
  }

  if (/^\/hsl(?:@[A-Za-z0-9_]{5,32})?(?:\s.*)?$/i.test(normalizedText)) {
    return [
      '🚌 Расписание транспорта HSL',
      'Отправьте номер остановки, например H1234, или поделитесь геопозицией.',
    ].join('\n\n');
  }

  return [
    'Я понимаю команды:',
    '/start — подключить персональную рассылку',
    '/settings — открыть настройки',
    '/hsl — расписание транспорта HSL',
    '/chatid — показать ID этого чата',
    '/help — показать инструкцию',
  ].join('\n');
}

module.exports = {
  RUSSIAN_BOT_COMMANDS,
  RUSSIAN_BOT_DESCRIPTION,
  RUSSIAN_BOT_SHORT_DESCRIPTION,
  configureRussianTelegramBot,
  configureTelegramWebhook,
  getTelegramWebhookUrl,
  getRussianTelegramReply,
};
