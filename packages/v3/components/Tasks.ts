import path from 'path';
import { task, types } from 'hardhat/config';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { LedgerSigner } from '@ethersproject/hardware-wallets';
import { BigNumber, BigNumberish } from 'ethers';

// This is meant to go away as soon as hardhat implement this https://github.com/nomiclabs/hardhat/issues/1518

export function importCsjOrEsModule(filePath: string): any {
    const imported = require(filePath);
    return imported.default !== undefined ? imported.default : imported;
}

export function lazyAction(pathToAction: string) {
    return (taskArgs: any, hre: any, runSuper: any) => {
        const actualPath = path.isAbsolute(pathToAction)
            ? pathToAction
            : path.join(hre.config.paths.root, pathToAction);
        const action = importCsjOrEsModule(actualPath);

        return action(taskArgs, hre, runSuper);
    };
}

// Task
export type taskOverride = { gasPrice?: BigNumberish };
export type defaultParam = {
    ledger: boolean;
    ledgerPath: string;
    gasPrice: number;
};
export const newDefaultTask = (taskName: string, description: string) =>
    task('bancor:' + taskName, description)
        .addFlag('ledger', 'Signing from a ledger')
        .addParam('ledgerPath', 'Ledger path', "m/44'/60'/0'/0", types.string)
        .addParam('gasPrice', 'GasPrice in gwei', 0, types.int);

//
export const getDefaultParams = async (hre: HardhatRuntimeEnvironment, args: defaultParam) => {
    return {
        signer: args.ledger
            ? new LedgerSigner(hre.ethers.provider, 'hid', args.ledgerPath)
            : (await hre.ethers.getSigners())[0],
        gasPrice: args.gasPrice === 0 ? undefined : BigNumber.from(args.gasPrice)
    };
};
