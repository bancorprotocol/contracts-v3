import { ContractName, DeployedContracts, DeploymentTag, deployProxy, grantRole } from '../utils/Deploy';
import { Roles } from '../utils/Roles';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const network = await DeployedContracts.BancorNetworkV1.deployed();
    const networkSettings = await DeployedContracts.NetworkSettingsV1.deployed();
    const bntGovernance = await DeployedContracts.BNTGovernance.deployed();
    const bntPool = await DeployedContracts.BNTPool.deployed();
    const externalRewardsVault = await DeployedContracts.ExternalRewardsVault.deployed();

    const standardRewardsAddress = await deployProxy({
        name: ContractName.StandardStakingRewards,
        from: deployer,
        args: [
            network.address,
            networkSettings.address,
            bntGovernance.address,
            bntPool.address,
            externalRewardsVault.address
        ]
    });

    await grantRole({
        name: ContractName.BNTGovernance,
        id: Roles.TokenGovernance.ROLE_MINTER,
        member: standardRewardsAddress,
        from: deployer
    });

    await grantRole({
        name: ContractName.ExternalRewardsVault,
        id: Roles.Vault.ROLE_ASSET_MANAGER,
        member: standardRewardsAddress,
        from: deployer
    });

    return true;
};

func.id = DeploymentTag.StandardStakingRewardsV1;
func.dependencies = [
    DeploymentTag.V2,
    DeploymentTag.ProxyAdmin,
    DeploymentTag.BancorNetworkV1,
    DeploymentTag.NetworkSettingsV1,
    DeploymentTag.BNTPoolV1,
    DeploymentTag.ExternalRewardsVaultV1
];
func.tags = [DeploymentTag.V3, DeploymentTag.StandardStakingRewardsV1];

export default func;
