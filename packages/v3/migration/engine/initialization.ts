import Contracts from '../../components/Contracts';
import { FORK_CONFIG, FORK_PREFIX } from '../../hardhat.config';
import { initExecutionFunctions } from './executions';
import { log } from './logger/logger';
import { LedgerSigner } from '@ethersproject/hardware-wallets';
import { BigNumberish } from 'ethers';
import { parseUnits } from 'ethers/lib/utils';
import { ethers, network } from 'hardhat';

export type defaultMigrationArgs = {
    ledger: boolean;
    ledgerPath: string;
    gasPrice: number;
    confirmationToWait: number;
};

export type executionSettings = { gasPrice?: BigNumberish; confirmationToWait: number };

export const initMigration = async (args: defaultMigrationArgs) => {
    // init networking
    const networkName = FORK_CONFIG ? FORK_CONFIG.networkName : network.name;
    const migrationNetworkConfig = {
        isFork: networkName.startsWith(FORK_PREFIX),
        originalNetwork: networkName.substring(FORK_PREFIX.length),
        networkName: networkName
    };

    // init signer
    const signer = args.ledger
        ? new LedgerSigner(ethers.provider, 'hid', args.ledgerPath)
        : (await ethers.getSigners())[0];

    // init execution settings
    const executionSettings: executionSettings = {
        confirmationToWait: args.confirmationToWait
    };

    if (
        executionSettings.confirmationToWait <= 1 &&
        !(migrationNetworkConfig.isFork || migrationNetworkConfig.networkName === 'hardhat')
    ) {
        throw new Error(
            `Transaction confirmation should be defined or higher than 1 for ${migrationNetworkConfig.networkName} use. Aborting`
        );
    }

    if (!args.gasPrice && !(migrationNetworkConfig.isFork || migrationNetworkConfig.networkName === 'hardhat')) {
        throw new Error(`Gas Price shouldn't be equal to 0 for ${migrationNetworkConfig.networkName} use. Aborting`);
    }
    executionSettings.gasPrice = args.gasPrice === 0 ? undefined : parseUnits(args.gasPrice.toString(), 'gwei');

    // init contracts
    const contracts = Contracts.connect(signer);

    // init execution functions
    const executionFunctions = initExecutionFunctions(contracts, executionSettings);

    log.migrationConfig(await signer.getAddress(), args.ledger, executionSettings);

    return {
        signer,
        contracts,
        executionSettings,
        executionFunctions
    };
};
