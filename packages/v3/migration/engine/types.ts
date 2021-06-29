import { Signer } from 'ethers';
import { deployExecuteType } from './utils';

export type defaultParam = {
    ledger: boolean;
    ledgerPath: string;
    gasPrice: number;
    confirmationToWait: number;
};

export type State = {
    migrationState: {
        latestMigration: number;
    };
    networkState: any;
};

export type token = {
    address: string;
    tx: string;
};

export interface Migration {
    up: (signer: Signer, oldState: any, { deploy, execute }: deployExecuteType) => Promise<{}>;
    healthcheck: (signer: Signer, state: any, { deploy, execute }: deployExecuteType) => Promise<boolean>;
}
