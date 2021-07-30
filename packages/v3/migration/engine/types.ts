import { initExecutionFunctions } from './executions';
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

export type executionFunctions = ReturnType<typeof initExecutionFunctions>;

export interface Migration {
    up: (
        signer: Signer,
        contracts: Contracts,
        initialState: any,
        { deploy, execute, deployProxy }: executionFunctions
    ) => Promise<{}>;
    healthCheck: (
        signer: Signer,
        contracts: Contracts,
        newState: any,
        { deploy, execute, deployProxy }: executionFunctions
    ) => Promise<any>;
}
