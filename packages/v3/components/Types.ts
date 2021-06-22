export type deployedContract = {
    address: string;
    tx: string;
};

export type DeploymentConfig = {};

export type tokenHolder = {};

export type System = {
    tokenHolder: tokenHolder & deployedContract;
};

export type NewSystem = {
    tokenHolder: tokenHolder & deployedContract;
    tokenHolder1: tokenHolder & deployedContract;
};
