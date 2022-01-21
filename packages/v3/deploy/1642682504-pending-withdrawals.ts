import { ContractName, DeploymentTag } from '../utils/Constants';
import { deployProxy, DeployedContracts } from '../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const networkProxy = await DeployedContracts.BancorNetworkProxy.deployed();
    const networkToken = await DeployedContracts.NetworkToken.deployed();
    const masterPool = await DeployedContracts.MasterPool.deployed();

    await deployProxy({
        name: ContractName.PendingWithdrawals,
        from: deployer,
        args: [networkProxy.address, networkToken.address, masterPool.address]
    });

    return true;
};

func.id = ContractName.PendingWithdrawals;
func.dependencies = [
    DeploymentTag.V2,
    ContractName.ProxyAdmin,
    ContractName.BancorNetworkProxy,
    ContractName.MasterPool
];
func.tags = [DeploymentTag.V3, ContractName.PendingWithdrawals];

export default func;
