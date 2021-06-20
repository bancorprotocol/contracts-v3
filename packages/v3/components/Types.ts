// Token
export type token = {};

// Pools
export type pool = {};
export type poolToDeploy = {};

export type ROLES = 'ALPHA' | 'BETA';

export type deployedContract = {
    address: string;
};

export type tokenHolder = {
    roles: ROLES[];
};

export type DeploymentConfig = {
    tokenHolder: tokenHolder;
};

export type SystemConfig = {
    tokenHolder: tokenHolder & deployedContract;
};
