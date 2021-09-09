export type SystemState = {
    migrationState: {
        latestMigration: number;
    };
    networkState: any;
};

export type Deployment = {
    contractName: string;
    abi: any; // object
    bytecode: string;
};
export type SystemDeployments = { [address: string]: Deployment };

export type deployedContract = string;
export type deployedProxy = { proxyContract: deployedContract; logicContract: deployedContract };

export type MigrationData = {
    fullPath: string;
    fileName: string;
    migrationTimestamp: number;
};

export type ExecutionSettings = {
    confirmationToWait: number;
};

export type NetworkSettings = {
    networkName: string;
    isFork: boolean;
    isHardhat: boolean;
    originalNetwork: string;
};

export type defaultArgs = {
    reset: boolean;

    // ledger
    ledger: boolean;
    ledgerPath: string;

    // settings
    gasPrice: number;
    minBlockConfirmations: number;
};

export interface Migration {
    up: (initialState: any) => Promise<any>;
    healthCheck: (initialState: any, newState: any) => Promise<any>;
    down: (initialState: any, newState: any) => Promise<any>;
}
