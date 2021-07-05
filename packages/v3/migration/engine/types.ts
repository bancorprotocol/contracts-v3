import { Contracts } from 'components/Contracts';
import { Signer } from 'ethers';
import { deployExecuteType } from './executions';

export type SystemState = {
    migrationState: {
        latestMigration: number;
    };
    networkState: any;
};

export type deployedContract = {
    address: string;
    tx: string;
};

export interface Migration {
    up: (signer: Signer, contracts: Contracts, oldState: any, { deploy, execute }: deployExecuteType) => Promise<{}>;
    healthcheck: (
        signer: Signer,
        contracts: Contracts,
        newState: any,
        { deploy, execute }: deployExecuteType
    ) => Promise<boolean>;
}
