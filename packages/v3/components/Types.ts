export type deployedContract = {
    address: string;
    tx: string;
};

// Components
export type tokenHolder = {};

// Deployment Config
export type DeploymentConfig = {};

// System
export type System = {
    tokenHolder: tokenHolder & deployedContract;
};

export type NewSystem = {
    tokenHolder: tokenHolder & deployedContract;
    tokenHolder1: tokenHolder & deployedContract;
};
