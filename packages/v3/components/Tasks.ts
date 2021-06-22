import fs from 'fs';
import path from 'path';
import { task, types } from 'hardhat/config';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { LedgerSigner } from '@ethersproject/hardware-wallets';
import { BigNumber, BigNumberish } from 'ethers';
import Contracts from './Contracts';

// This is meant to go away as soon as hardhat implements this https://github.com/nomiclabs/hardhat/issues/1518

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

// Task

const DEPLOYMENT_FILE_NAME = 'deployment.config.json';
const SYSTEM_FILE_NAME = 'system.json';

export type taskOverride = { gasPrice?: BigNumberish };
export type executionConfig = { confirmationToWait: number };
export type defaultParam = {
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
        .addParam('confirmationToWait', 'Number of confirmation to wait', 0, types.int);

export const loadConfig = async <C>(path: string): Promise<C> => {
    return JSON.parse(fs.readFileSync(path, 'utf8')) as C;
};

export const getDefaultParamsWithConfig = async <C>(
    hre: HardhatRuntimeEnvironment,
    args: defaultParam,
    isFreshDeployment = false
) => {
    const fileName = isFreshDeployment ? DEPLOYMENT_FILE_NAME : SYSTEM_FILE_NAME;

    // Signer check
    const signer = args.ledger
        ? new LedgerSigner(hre.ethers.provider, 'hid', args.ledgerPath)
        : (await hre.ethers.getSigners())[0];

    // Overrides check
    let overrides: taskOverride = {};

    if (args.gasPrice === 0 && hre.network.name !== 'hardhat') {
        throw new Error("Gas Price shouldn't be equal to 0");
    }
    overrides.gasPrice = args.gasPrice === 0 ? undefined : BigNumber.from(args.gasPrice);

    // Execution config
    let executionConfig: executionConfig = {
        confirmationToWait: args.confirmationToWait
    };

    if (args.confirmationToWait === 0 && hre.network.name !== 'hardhat') {
        throw new Error("Confirmation to wait shouldn't be equal to 0");
    }

    const pathToFile = path.join(hre.config.paths.root, 'deployments', hre.network.name, fileName);

    let config: C;
    try {
        config = await loadConfig<C>(pathToFile);
    } catch {
        throw new Error(`There is an issue loading the config file at path; ${pathToFile}.`);
    }

    return {
        signer,
        executionConfig,
        config,
        overrides
    };
};
