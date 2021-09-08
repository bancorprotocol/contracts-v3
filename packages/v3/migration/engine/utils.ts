/* eslint-disable @typescript-eslint/no-var-requires */
import fs from 'fs-extra';
import path from 'path';

export const importCsjOrEsModule = (filePath: string) => {
    const imported = require(filePath);
    return imported.default || imported;
};

export const initEngineAndStartTask = (pathToAction: string) => {
    return (taskArgs: any, hre: any) => {
        const actualPath = path.isAbsolute(pathToAction)
            ? pathToAction
            : path.join(hre.config.paths.root, pathToAction);
        const action = importCsjOrEsModule(actualPath);
        const start = importCsjOrEsModule(path.join(hre.config.paths.root, 'migration/engine/index.ts'));
        return start(taskArgs, hre, action);
    };
};

export const isMigrationFolderValid = (path: string) => {
    if (!fs.existsSync(path)) return false;
    if (!fs.readdirSync(path).find((f: string) => f === 'state.json')) return false;
    if (!fs.existsSync(path + '/deployments')) return false;
    return true;
};
