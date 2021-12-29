import { deployments } from 'hardhat';

const { deploy: deployContract, execute: executeTransaction, getNetworkName } = deployments;

export enum ContractIds {
    NetworkToken = 'NetworkToken',
    NetworkTokenGovernance = 'NetworkTokenGovernance',
    GovToken = 'GovToken',
    GovTokenGovernance = 'GovTokenGovernance'
}

export enum Tags {
    V2 = 'V2'
}

export enum Networks {
    MAINNET = 'mainnet'
}

interface DeployOptions {
    id: ContractIds;
    contract?: string;
    args?: any[];
    from: string;
}

export const deploy = async (options: DeployOptions) => {
    const { id, contract, from, args } = options;

    const res = await deployContract(id, {
        contract: contract || id,
        from,
        args,
        log: true
    });

    return res.address;
};

interface ExecuteOptions {
    id: ContractIds;
    methodName: string;
    args?: any[];
    from: string;
}

export const execute = async (options: ExecuteOptions) => {
    const { id, methodName, from, args } = options;

    return executeTransaction(id, { from, log: true }, methodName, ...(args || []));
};

export const isMainnet = () => getNetworkName() === Networks.MAINNET;
