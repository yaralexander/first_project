require('dotenv').config();

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const sourcePath = path.resolve(
  process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'finskienovosti.db'),
);
const backupDirectory = path.resolve(
  process.env.BACKUP_DIRECTORY || path.join(path.dirname(sourcePath), 'backups'),
);

function timestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

async function backupDatabase() {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`SQLite-база не найдена: ${sourcePath}`);
  }
  fs.mkdirSync(backupDirectory, { recursive: true });
  const destination = path.join(backupDirectory, `finskienovosti-${timestamp()}.db`);
  const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
  try {
    await source.backup(destination);
  } finally {
    source.close();
  }
  return destination;
}

if (require.main === module) {
  backupDatabase()
    .then((destination) => {
      process.stdout.write(`${JSON.stringify({ source: sourcePath, backup: destination }, null, 2)}\n`);
    })
    .catch((error) => {
      console.error('[backup] ошибка:', error.message);
      process.exitCode = 1;
    });
}

module.exports = { backupDatabase, sourcePath };
