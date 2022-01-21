import { ContractName, DeploymentTag } from '../utils/Constants';
import { deployProxy, execute, DeployedContracts } from '../utils/Deploy';
import { Roles } from '../utils/Roles';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer, daoMultisig } = await getNamedAccounts();

    const networkProxy = await DeployedContracts.BancorNetworkProxy.deployed();
    const networkToken = await DeployedContracts.NetworkToken.deployed();
    const masterPool = await DeployedContracts.MasterPool.deployed();

    await deployProxy({
        name: ContractName.PendingWithdrawals,
        from: deployer,
        args: [networkProxy.address, networkToken.address, masterPool.address]
    });

    await execute({
        name: ContractName.PendingWithdrawals,
        methodName: 'grantRole',
        args: [Roles.Upgradeable.ROLE_ADMIN, daoMultisig],
        from: deployer
    });

    await execute({
        name: ContractName.PendingWithdrawals,
        methodName: 'revokeRole',
        args: [Roles.Upgradeable.ROLE_ADMIN, deployer],
        from: deployer
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
