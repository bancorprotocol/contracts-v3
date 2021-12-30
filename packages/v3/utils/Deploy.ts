import { NetworkToken, GovToken, TokenGovernance } from '../components/LegacyContracts';
import { ContractNames, Networks } from './Constants';
import { Contract } from 'ethers';
import { deployments, ethers } from 'hardhat';

const { deploy: deployContract, execute: executeTransaction, getNetworkName, fixture, run } = deployments;

const deployed = <F extends Contract>(name: ContractNames) => ({
    deployed: async () => ethers.getContract<F>(name)
});

export const DeployedContracts = {
    NetworkToken: deployed<NetworkToken>(ContractNames.NetworkToken),
    NetworkTokenGovernance: deployed<TokenGovernance>(ContractNames.NetworkTokenGovernance),
    GovToken: deployed<GovToken>(ContractNames.GovToken),
    GovTokenGovernance: deployed<TokenGovernance>(ContractNames.GovTokenGovernance)
};

export const isHardhat = () => getNetworkName() === Networks.HARDHAT || Networks.HARDHAT_MAINNET_FORK;
export const isHardhatMainnetFork = () => getNetworkName() === Networks.HARDHAT_MAINNET_FORK;
export const isMainnetFork = () => isHardhatMainnetFork();
export const isMainnet = () => getNetworkName() === Networks.MAINNET || isMainnetFork();

interface DeployOptions {
    name: ContractNames;
    contract?: string;
    args?: any[];
    from: string;
}

export const deploy = async (options: DeployOptions) => {
    const { name, contract, from, args } = options;

    const res = await deployContract(name, {
        contract: contract || name,
        from,
        args,
        log: true
    });

    return res.address;
};

interface ExecuteOptions {
    name: ContractNames;
    methodName: string;
    args?: any[];
    from: string;
}

export const execute = async (options: ExecuteOptions) => {
    const { name, methodName, from, args } = options;

    return executeTransaction(name, { from, log: true }, methodName, ...(args || []));
};

export const runTestDeployment = async (tags?: string | string[]) => {
    if (isMainnet()) {
        throw new Error('Unsupported network');
    }

    // mainnet forks don't support evm_snapshot, so we have to run test deployment every time before tests
    if (isMainnetFork()) {
        return run(tags, { resetMemory: false });
    }

    return fixture(tags);
};
