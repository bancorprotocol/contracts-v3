import path from 'path';
import { task, types } from 'hardhat/config';
import { BigNumberish } from 'ethers';

export type executeOverride = { gasPrice?: BigNumberish };

export type executionConfig = { confirmationToWait: number };

export const importCsjOrEsModule = (filePath: string) => {
    const imported = require(filePath);
    return imported.default !== undefined ? imported.default : imported;
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

export type defaultParamTask = {
    ledger: boolean;
    ledgerPath: string;
    gasPrice: number;
    confirmationToWait: number;
};

export const newDefaultTask = (taskName: string, description: string) =>
    task('bancor:' + taskName, description)
        .addFlag('ledger', 'Signing from a ledger')
        .addParam('ledgerPath', 'Ledger path', "m/44'/60'/0'/0", types.string)
        .addParam('gasPrice', 'GasPrice in gwei', 0, types.int)
        .addParam('confirmationToWait', 'Number of confirmation to wait', 1, types.int);
