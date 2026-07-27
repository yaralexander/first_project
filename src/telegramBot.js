const RUSSIAN_BOT_COMMANDS = Object.freeze([
  { command: 'start', description: 'Подключить персональную рассылку' },
  { command: 'settings', description: 'Открыть настройки рассылки' },
  { command: 'help', description: 'Показать инструкцию' },
]);

const RUSSIAN_BOT_DESCRIPTION = [
  'Персональная рассылка «Финских Новостей».',
  'Подключите аккаунт и получайте выбранные новости Финляндии на русском языке.',
].join(' ');

const RUSSIAN_BOT_SHORT_DESCRIPTION = 'Новости Финляндии на русском языке — по вашим темам и расписанию.';

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

function getRussianTelegramReply(text, { accountUrl, linkSucceeded = false } = {}) {
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
      'Чтобы подключить рассылку, войдите в личный кабинет, получите код и нажмите кнопку «Открыть бота и подключить»:',
      accountLink,
    ].join('\n\n');
  }

  if (/^\/settings(?:@[A-Za-z0-9_]{5,32})?$/i.test(normalizedText)) {
    return `Настройки тем и частоты рассылки находятся в личном кабинете:\n\n${accountLink}`;
  }

  return [
    'Я понимаю команды:',
    '/start — подключить персональную рассылку',
    '/settings — открыть настройки',
    '/help — показать инструкцию',
  ].join('\n');
}

module.exports = {
  RUSSIAN_BOT_COMMANDS,
  RUSSIAN_BOT_DESCRIPTION,
  RUSSIAN_BOT_SHORT_DESCRIPTION,
  configureRussianTelegramBot,
  getRussianTelegramReply,
};
