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
    up: (signer: Signer, oldState: any, { deploy, execute }: deployExecuteType) => Promise<{}>;
    healthcheck: (signer: Signer, state: any, { deploy, execute }: deployExecuteType) => Promise<boolean>;
}
