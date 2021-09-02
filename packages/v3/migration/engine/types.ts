import { Contracts } from '../../components/Contracts';
import { initExecutionFunctions } from './executions';
import { Signer } from 'ethers';

export type SystemState = {
    migrationState: {
        latestMigration: number;
    };
    networkState: any;
};

export type deployedContract = string;

export type deployedProxy = { proxyContract: deployedContract; logicContract: deployedContract };

export type executionFunctions = ReturnType<typeof initExecutionFunctions>;

export interface Migration {
    up: (
        signer: Signer,
        contracts: Contracts,
        initialState: any,
        executionFunctions: executionFunctions
    ) => Promise<any>;
    healthCheck: (
        signer: Signer,
        contracts: Contracts,
        initialState: any,
        newState: any,
        executionFunctions: executionFunctions
    ) => Promise<any>;
    down: (
        signer: Signer,
        contracts: Contracts,
        initialState: any,
        newState: any,
        executionFunctions: executionFunctions
    ) => Promise<any>;
}
