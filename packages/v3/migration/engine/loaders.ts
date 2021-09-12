import { importCsjOrEsModule } from './utils';
import path from 'path';

export const basicTaskLoader = (pathToAction: string) => {
    return (taskArgs: any, hre: any) => {
        const actualPath = path.isAbsolute(pathToAction)
            ? pathToAction
            : path.join(hre.config.paths.root, pathToAction);
        const task = importCsjOrEsModule(actualPath);
        return task(taskArgs, hre);
    };
};

export const migrationLoader = (pathToAction: string) => {
    return (taskArgs: any, hre: any) => {
        const loader = importCsjOrEsModule(path.join(hre.config.paths.root, 'migration/engine/index.ts'));
        return loader(taskArgs, hre, basicTaskLoader(pathToAction));
    };
};
