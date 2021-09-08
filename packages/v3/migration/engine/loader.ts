import { importCsjOrEsModule } from './utils';
import path from 'path';

export const loader = (pathToAction: string) => {
    return (taskArgs: any, hre: any) => {
        const actualPath = path.isAbsolute(pathToAction)
            ? pathToAction
            : path.join(hre.config.paths.root, pathToAction);
        const task = importCsjOrEsModule(actualPath);
        const start = importCsjOrEsModule(path.join(hre.config.paths.root, 'migration/engine/index.ts'));
        return start(taskArgs, hre, task);
    };
};
