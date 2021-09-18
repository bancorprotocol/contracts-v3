import fs from 'fs-extra';
import path from 'path';
import { MIGRATION_DEPLOYMENTS_FOLDER, MIGRATION_STATE_FILE_NAME } from './Constants';

export const importCsjOrEsModule = (filePath: string) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const imported = require(filePath);
    return imported.default || imported;
};

export const isMigrationFolderValid = (dir: string) =>
    fs.existsSync(dir) &&
    fs.readdirSync(dir).find((f: string) => f === MIGRATION_STATE_FILE_NAME) &&
    fs.existsSync(path.join(dir, MIGRATION_DEPLOYMENTS_FOLDER));
