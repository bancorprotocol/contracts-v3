import path from 'path';

export const importCsjOrEsModule = (filePath: string) => {
    const imported = require(filePath);
    return imported.default || imported;
};

export const lazyAction = (pathToAction: string) => {
    return (taskArgs: any, hre: any, runSuper: any) => {
        const actualPath = path.isAbsolute(pathToAction)
            ? pathToAction
            : path.join(hre.config.paths.root, pathToAction);
        const action = importCsjOrEsModule(actualPath);

        return action(taskArgs, hre, runSuper);
    };
};
