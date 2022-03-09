import { ContractName, DeployedContracts, DeploymentTag, deployProxy, grantRole } from '../utils/Deploy';
import { Roles } from '../utils/Roles';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const network = await DeployedContracts.BancorNetworkV1.deployed();
    const networkSettings = await DeployedContracts.NetworkSettingsV1.deployed();
    const bntGovernance = await DeployedContracts.BNTGovernance.deployed();
    const bntPool = await DeployedContracts.BNTPoolV1.deployed();
    const externalRewardsVault = await DeployedContracts.ExternalRewardsVaultV1.deployed();

    const standardRewardsAddress = await deployProxy({
        name: ContractName.StandardStakingRewardsV1,
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
        name: ContractName.ExternalRewardsVaultV1,
        id: Roles.Vault.ROLE_ASSET_MANAGER,
        member: standardRewardsAddress,
        from: deployer
    });

    return true;
};

func.id = ContractName.StandardStakingRewardsV1;
func.dependencies = [
    DeploymentTag.V2,
    ContractName.ProxyAdmin,
    ContractName.BancorNetworkV1,
    ContractName.NetworkSettingsV1,
    ContractName.BNTPoolV1,
    ContractName.ExternalRewardsVaultV1
];
func.tags = [DeploymentTag.V3, ContractName.StandardStakingRewardsV1];

export default func;
