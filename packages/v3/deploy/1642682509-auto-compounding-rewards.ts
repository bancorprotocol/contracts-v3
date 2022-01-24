import { ContractName, DeploymentTag } from '../utils/Constants';
import { deployProxy, execute, DeployedContracts } from '../utils/Deploy';
import { Roles } from '../utils/Roles';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const network = await DeployedContracts.BancorNetwork.deployed();
    const networkSettings = await DeployedContracts.NetworkSettings.deployed();
    const networkToken = await DeployedContracts.NetworkToken.deployed();
    const masterPool = await DeployedContracts.MasterPool.deployed();

    const autoCompoundingRewardsAddress = await deployProxy({
        name: ContractName.AutoCompoundingStakingRewards,
        from: deployer,
        args: [network.address, networkSettings.address, networkToken.address, masterPool.address]
    });

    await execute({
        name: ContractName.MasterPool,
        methodName: 'grantRole',
        args: [Roles.MasterPool.ROLE_MASTER_POOL_TOKEN_MANAGER, autoCompoundingRewardsAddress],
        from: deployer
    });

    await execute({
        name: ContractName.ExternalRewardsVault,
        methodName: 'grantRole',
        args: [Roles.Vault.ROLE_ASSET_MANAGER, autoCompoundingRewardsAddress],
        from: deployer
    });

    return true;
};

func.id = ContractName.AutoCompoundingStakingRewards;
func.dependencies = [
    DeploymentTag.V2,
    ContractName.ProxyAdmin,
    ContractName.BancorNetwork,
    ContractName.NetworkSettings,
    ContractName.MasterPool,
    ContractName.ExternalRewardsVault
];
func.tags = [DeploymentTag.V3, ContractName.AutoCompoundingStakingRewards];

export default func;
