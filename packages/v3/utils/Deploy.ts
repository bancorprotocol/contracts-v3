import { deployments } from 'hardhat';

const { deploy: deployContract, execute: executeTransaction } = deployments;

export enum ContractId {
    NetworkToken = 'NetworkToken',
    NetworkTokenGovernance = 'NetworkTokenGovernance',
    GovToken = 'GovToken',
    GovTokenGovernance = 'GovTokenGovernance'
}

export enum Tags {
    V2 = 'V2'
}

interface DeployOptions {
    id: ContractId;
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
    id: ContractId;
    methodName: string;
    args?: any[];
    from: string;
}

export const execute = async (options: ExecuteOptions) => {
    const { id, methodName, from, args } = options;

    return executeTransaction(id, { from, log: true }, methodName, ...(args || []));
};
