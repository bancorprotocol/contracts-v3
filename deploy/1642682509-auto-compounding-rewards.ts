import { ContractName, DeploymentTag, deployProxy, DeployedContracts, grantRole } from '../utils/Deploy';
import { Roles } from '../utils/Roles';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const network = await DeployedContracts.BancorNetworkV1.deployed();
    const networkSettings = await DeployedContracts.NetworkSettingsV1.deployed();
    const bnt = await DeployedContracts.BNT.deployed();
    const bntPool = await DeployedContracts.BNTPoolV1.deployed();

    const autoCompoundingRewardsAddress = await deployProxy({
        name: ContractName.AutoCompoundingStakingRewardsV1,
        from: deployer,
        args: [network.address, networkSettings.address, bnt.address, bntPool.address]
    });

    await grantRole({
        name: ContractName.BNTPoolV1,
        id: Roles.BNTPool.ROLE_BNT_POOL_TOKEN_MANAGER,
        member: autoCompoundingRewardsAddress,
        from: deployer
    });

    await grantRole({
        name: ContractName.ExternalRewardsVaultV1,
        id: Roles.Vault.ROLE_ASSET_MANAGER,
        member: autoCompoundingRewardsAddress,
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
    ContractName.BNTPoolV1,
    ContractName.ExternalRewardsVaultV1
];
func.tags = [DeploymentTag.V3, ContractName.AutoCompoundingStakingRewardsV1];

export default func;
