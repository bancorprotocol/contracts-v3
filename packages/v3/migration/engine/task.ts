import { initProxy } from './Proxy';
import { initDeployExecute } from './executions';
import { executionTools } from './types';
import { LedgerSigner } from '@ethersproject/hardware-wallets';
import Contracts from 'components/Contracts';
import { BigNumberish } from 'ethers';
import { parseUnits } from 'ethers/lib/utils';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { NETWORK_NAME } from 'migration/config';

export type defaultParamTask = {
    ledger: boolean;
    ledgerPath: string;
    gasPrice: number;
    confirmationToWait: number;
};

export type executeOverride = { gasPrice?: BigNumberish };
export type executionConfig = { confirmationToWait: number };

export const getDefaultParams = async (hre: HardhatRuntimeEnvironment, args: defaultParamTask) => {
    // Signer check
    const signer = args.ledger
        ? new LedgerSigner(hre.ethers.provider, 'hid', args.ledgerPath)
        : (await hre.ethers.getSigners())[0];

    // Overrides check
    const overrides: executeOverride = {};

    if (!args.gasPrice && NETWORK_NAME === 'mainnet') {
        throw new Error("Gas Price shouldn't be equal to 0 for mainnet use. Aborting");
    }
    overrides.gasPrice = args.gasPrice === 0 ? undefined : parseUnits(args.gasPrice.toString(), 'gwei');

    // Execution config
    let executionConfig: executionConfig = {
        confirmationToWait: args.confirmationToWait
    };

    if (executionConfig.confirmationToWait <= 1 && NETWORK_NAME === 'mainnet') {
        throw new Error("Transaction confirmation wasn't defined. Aborting");
    }

    const contracts = Contracts.connect(signer);

    const deployExecute = initDeployExecute(executionConfig, overrides);
    const proxy = initProxy(contracts, deployExecute);

    const executionTools: executionTools = {
        ...deployExecute,
        ...proxy
    };

    return {
        signer,
        contracts,
        overrides,
        executionConfig,
        executionTools
    };
};
