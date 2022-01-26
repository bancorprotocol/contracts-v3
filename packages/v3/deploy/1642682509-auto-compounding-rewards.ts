import { ContractName, DeploymentTag, deployProxy, execute, DeployedContracts } from '../utils/Deploy';
import { Roles } from '../utils/Roles';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const network = await DeployedContracts.BancorNetworkV1.deployed();
    const networkSettings = await DeployedContracts.NetworkSettingsV1.deployed();
    const networkToken = await DeployedContracts.NetworkToken.deployed();
    const masterPool = await DeployedContracts.MasterPoolV1.deployed();

    const autoCompoundingRewardsAddress = await deployProxy({
        name: ContractName.AutoCompoundingStakingRewardsV1,
        from: deployer,
        args: [network.address, networkSettings.address, networkToken.address, masterPool.address]
    });

    await execute({
        name: ContractName.MasterPoolV1,
        methodName: 'grantRole',
        args: [Roles.MasterPool.ROLE_MASTER_POOL_TOKEN_MANAGER, autoCompoundingRewardsAddress],
        from: deployer
    });

    await execute({
        name: ContractName.ExternalRewardsVaultV1,
        methodName: 'grantRole',
        args: [Roles.Vault.ROLE_ASSET_MANAGER, autoCompoundingRewardsAddress],
        from: deployer
    });

    return true;
};

func.id = ContractName.AutoCompoundingStakingRewardsV1;
func.dependencies = [
    DeploymentTag.V2,
    ContractName.ProxyAdmin,
    ContractName.BancorNetworkV1,
    ContractName.NetworkSettingsV1,
    ContractName.MasterPoolV1,
    ContractName.ExternalRewardsVaultV1
];
func.tags = [DeploymentTag.V3, ContractName.AutoCompoundingStakingRewardsV1];

export default func;
