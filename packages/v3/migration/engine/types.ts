import { Contracts } from 'components/Contracts';
import { Signer } from 'ethers';
import { deployExecuteType } from './executions';
import { proxyType } from './Proxy';

export type SystemState = {
    migrationState: {
        latestMigration: number;
    };
    networkState: any;
};

export type deployedContract = string;

export type deployedProxy = {
    proxy: deployedContract;
    logic: deployedContract;
};

export type executionTools = deployExecuteType & proxyType;

export interface Migration {
    up: (
        signer: Signer,
        contracts: Contracts,
        initialState: any,
        { deploy, execute, createProxy }: executionTools
    ) => Promise<{}>;
    healthcheck: (
        signer: Signer,
        contracts: Contracts,
        newState: any,
        { deploy, execute, createProxy }: executionTools
    ) => Promise<boolean>;
}
