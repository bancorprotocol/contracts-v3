import { deployExecuteType } from './executions';
import { proxyType } from './proxy';
import { Contracts } from 'components/Contracts';
import { Signer } from 'ethers';

export type SystemState = {
    migrationState: {
        latestMigration: number;
    };
    networkState: any;
};

export type deployedContract = string;

export type deployedProxy = deployedContract;

export type executionTools = deployExecuteType & proxyType;

export interface Migration {
    up: (
        signer: Signer,
        contracts: Contracts,
        initialState: any,
        { deploy, execute, createProxy }: executionTools
    ) => Promise<{}>;
    healthCheck: (
        signer: Signer,
        contracts: Contracts,
        newState: any,
        { deploy, execute, createProxy }: executionTools
    ) => Promise<boolean>;
}
