import { ContractName, DeployedContracts, DeploymentTag, deployProxy, grantRole } from '../utils/Deploy';
import { Roles } from '../utils/Roles';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const network = await DeployedContracts.BancorNetworkV1.deployed();
    const networkSettings = await DeployedContracts.NetworkSettingsV1.deployed();
    const bnt = await DeployedContracts.BNT.deployed();
    const bntPool = await DeployedContracts.BNTPool.deployed();

    const autoCompoundingRewardsAddress = await deployProxy({
        name: ContractName.AutoCompoundingStakingRewards,
        from: deployer,
        args: [network.address, networkSettings.address, bnt.address, bntPool.address]
    });

    await grantRole({
        name: ContractName.BNTPool,
        id: Roles.BNTPool.ROLE_BNT_POOL_TOKEN_MANAGER,
        member: autoCompoundingRewardsAddress,
        from: deployer
    });

    await grantRole({
        name: ContractName.ExternalRewardsVault,
        id: Roles.Vault.ROLE_ASSET_MANAGER,
        member: autoCompoundingRewardsAddress,
        from: deployer
    });

    return true;
};

func.id = DeploymentTag.AutoCompoundingStakingRewardsV1;
func.dependencies = [
    DeploymentTag.V2,
    DeploymentTag.ProxyAdmin,
    DeploymentTag.BancorNetworkV1,
    DeploymentTag.NetworkSettingsV1,
    DeploymentTag.BNTPoolV1,
    DeploymentTag.ExternalRewardsVaultV1
];
func.tags = [DeploymentTag.V3, DeploymentTag.AutoCompoundingStakingRewardsV1];

export default func;
