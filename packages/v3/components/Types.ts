export type deployedContract = {
    address: string;
    tx: string;
};

export type DeploymentConfig = {};

export type tokenHolder = {};

export type System = {
    tokenHolder: tokenHolder & deployedContract;
};
