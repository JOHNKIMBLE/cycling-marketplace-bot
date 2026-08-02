const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function getConfiguredLevel() {
  const raw = process.env.LOG_LEVEL?.trim().toLowerCase() || 'info';
  return LEVELS[raw] ? raw : 'info';
}

function shouldLog(level) {
  return LEVELS[level] >= LEVELS[getConfiguredLevel()];
}

function normalizeError(error) {
  if (!error) {
    return null;
  }

  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    code: error.code,
  };
}

function formatEntry(level, message, context = {}) {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
    error: normalizeError(context.error),
  });
}

export function logDebug(message, context = {}) {
  if (shouldLog('debug')) {
    console.debug(formatEntry('debug', message, context));
  }
}

export function logInfo(message, context = {}) {
  if (shouldLog('info')) {
    console.info(formatEntry('info', message, context));
  }
}

export function logWarn(message, context = {}) {
  if (shouldLog('warn')) {
    console.warn(formatEntry('warn', message, context));
  }
}

export function logError(message, context = {}) {
  if (shouldLog('error')) {
    console.error(formatEntry('error', message, context));
  }
}
