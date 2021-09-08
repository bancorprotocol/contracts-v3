/* eslint-disable @typescript-eslint/no-var-requires */
import fs from 'fs-extra';

export const importCsjOrEsModule = (filePath: string) => {
    const imported = require(filePath);
    return imported.default || imported;
};

export const isMigrationFolderValid = (path: string) => {
    if (!fs.existsSync(path)) return false;
    if (!fs.readdirSync(path).find((f: string) => f === 'state.json')) return false;
    if (!fs.existsSync(path + '/deployments')) return false;
    return true;
};
