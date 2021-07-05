import fs from 'fs';
import path from 'path';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { LedgerSigner } from '@ethersproject/hardware-wallets';

import { parseUnits } from 'ethers/lib/utils';
import { initDeployExecute } from './executions';
import { defaultParamTask } from './tasks';
import { BigNumberish } from 'ethers';

export const MIGRATION_FOLDER = 'migration/migrations';
export const MIGRATION_DATA_FOLDER = 'migration/data';

export type executeOverride = { gasPrice?: BigNumberish };
export type executionConfig = { confirmationToWait: number };

export const getDefaultParams = async (hre: HardhatRuntimeEnvironment, args: defaultParamTask) => {
    // Signer check
    const signer = args.ledger
        ? new LedgerSigner(hre.ethers.provider, 'hid', args.ledgerPath)
        : (await hre.ethers.getSigners())[0];

    // Overrides check
    const overrides: executeOverride = {};

    if (!args.gasPrice && hre.network.name === 'mainnet') {
        throw new Error("Gas Price shouldn't be equal to 0 for mainnet use. Aborting");
    }
    overrides.gasPrice = args.gasPrice === 0 ? undefined : parseUnits(args.gasPrice.toString(), 'gwei');

    // Execution config
    let executionConfig: executionConfig = {
        confirmationToWait: args.confirmationToWait
    };

    if (executionConfig.confirmationToWait <= 1 && hre.network.name === 'mainnet') {
        throw new Error("Transaction confirmation wasn't defined. Aborting");
    }

    const deployExecute = initDeployExecute(executionConfig, overrides);

    return {
        signer,
        overrides,
        executionConfig,
        deployExecute
    };
};
