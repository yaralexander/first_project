function telegramApiFailure(method, responseStatus, payload) {
  const description = String(payload?.description || '').toLowerCase();
  const reason = description.includes('bot was blocked by the user') ? 'blocked_by_user'
    : description.includes('user is deactivated') ? 'user_deactivated'
      : description.includes('chat not found') ? 'chat_not_found'
        : description.includes('message is too long') ? 'message_too_long'
          : description.includes("can't parse entities") ? 'invalid_message_markup'
            : responseStatus === 429 ? 'rate_limited'
              : 'unknown';
  const status = Number.isInteger(payload?.error_code) ? payload.error_code : responseStatus;
  return new Error(`telegram ${method} failed (${status}: ${reason})`);
}

module.exports = { telegramApiFailure };
