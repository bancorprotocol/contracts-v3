import fs from 'fs';
import path from 'path';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { LedgerSigner } from '@ethersproject/hardware-wallets';
import { Contract } from 'components/Contracts';
import { ContractReceipt, ContractTransaction } from '@ethersproject/contracts';
import { defaultParamTask, executionConfig, executeOverride } from 'components/Tasks';
import { executionError } from './errors';
import chalk from 'chalk';
import { BigNumber } from 'ethers';
import { State } from 'migration/engine/types';
import { parseUnits } from 'ethers/lib/utils';

export const MIGRATION_FOLDER = 'migration';

export const writeFetchState = (hre: HardhatRuntimeEnvironment) => {
    const pathToState = path.join(hre.config.paths.root, MIGRATION_FOLDER, 'data', hre.network.name);
    return {
        writeState: async (migrationState: any, networkState: any) => {
            const state: State = {
                migrationState: migrationState,
                networkState: networkState
            };
            fs.writeFileSync(path.join(pathToState, 'state.json'), JSON.stringify(state, null, 4));
        },
        fetchState: () => {
            return JSON.parse(fs.readFileSync(path.join(pathToState, 'state.json'), 'utf-8')) as State;
        }
    };
};

export const getDefaultParams = async (hre: HardhatRuntimeEnvironment, args: defaultParamTask) => {
    // Signer check
    const signer = args.ledger
        ? new LedgerSigner(hre.ethers.provider, 'hid', args.ledgerPath)
        : (await hre.ethers.getSigners())[0];

    // Overrides check
    let overrides: executeOverride = {};

    if (args.gasPrice === 0 && hre.network.name === 'mainnet') {
        throw new Error("Gas Price shouldn't be equal to 0 for mainnet use");
    }
    overrides.gasPrice = args.gasPrice === 0 ? undefined : parseUnits(args.gasPrice.toString(), 'gwei');

    // Execution config
    let executionConfig: executionConfig = {
        confirmationToWait: args.confirmationToWait
    };

    if (executionConfig.confirmationToWait <= 1 && hre.network.name === 'mainnet') {
        throw new Error("Confirmation to wait shouldn't be lower than or equal to 1 for mainnet use");
    }

    // Deployment files
    let pathToDeploymentFiles = path.join(hre.config.paths.root, MIGRATION_FOLDER, 'data', hre.network.name);
    if (!fs.existsSync(pathToDeploymentFiles)) {
        fs.mkdirSync(pathToDeploymentFiles);
    }

    const allDeploymentFiles = fs.readdirSync(pathToDeploymentFiles);
    const deploymentFiles = allDeploymentFiles.filter((fileName: string) => fileName === 'state.json');

    const { writeState, fetchState } = writeFetchState(hre);

    // If there is no state file in the network's folder, create one
    if (deploymentFiles.length === 0) {
        writeState(
            {
                latestMigration: -1
            },
            {}
        );
    }
    const state = fetchState();

    // Migration files
    const pathToMigrationFiles = path.join(hre.config.paths.root, MIGRATION_FOLDER, 'migrations');
    const allMigrationFiles = fs.readdirSync(pathToMigrationFiles);
    const migrationFiles = allMigrationFiles.filter((fileName: string) => fileName.endsWith('.ts'));
    const migrationFilesPath = migrationFiles.map((fileName: string) => path.join(pathToMigrationFiles, fileName));
    const migrationsData: {
        fullPath: string;
        fileName: string;
        migrationId: number;
    }[] = [];
    for (const migrationFilePath of migrationFilesPath) {
        const fileName = path.basename(migrationFilePath);
        const migrationId = Number(fileName.split('_')[0]);
        if (migrationId > state.migrationState.latestMigration) {
            migrationsData.push({
                fullPath: migrationFilePath,
                fileName: fileName,
                migrationId: migrationId
            });
        }
    }
    migrationsData.sort((a, b) => (a.migrationId > b.migrationId ? 1 : b.migrationId > a.migrationId ? -1 : 0));
    return {
        signer,
        state,
        writeState,
        migrationsData,
        executionConfig,
        overrides
    };
};

export type deployExecuteType = ReturnType<typeof deployExecute>;
export const deployExecute = (executionConfig: executionConfig, overrides: executeOverride) => {
    const deploy = async <C extends Contract, T extends (...args: any[]) => Promise<C>>(
        name: string,
        func: T,
        ...args: Parameters<T>
    ): Promise<ReturnType<T>> => {
        const contract = await func(...args, overrides);
        console.log(chalk.yellow`Deploying contract ${name} (${contract.__contractName__})`);
        console.log(`Tx: `, contract.deployTransaction.hash);

        console.log(chalk.grey`Waiting to be mined ...`);
        const receipt = await contract.deployTransaction.wait(executionConfig.confirmationToWait);

        if (receipt.status !== 1) {
            console.log(chalk.red`Error while executing.`);
            throw new executionError(contract.deployTransaction, receipt);
        }

        console.log(chalk.greenBright`Deployed at ${contract.address} 🚀 `);
        return contract;
    };

    const execute = async <T extends (...args: any[]) => Promise<ContractTransaction>>(
        executionInstruction: string,
        func: T,
        ...args: Parameters<T>
    ): Promise<ContractReceipt> => {
        const tx = await func(...args, overrides);
        console.log(executionInstruction);
        console.log(`Executing tx: `, tx.hash);

        const receipt = await tx.wait(executionConfig.confirmationToWait);
        if (receipt.status !== 1) {
            console.log(chalk.red`Error while executing.`);
            throw new executionError(tx, receipt);
        }

        console.log(chalk.greenBright`Executed ✨`);
        return receipt;
    };

    return {
        deploy,
        execute
    };
};
