import { ContractName, DeployedContracts, DeploymentTag, deployProxy } from '../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const network = await DeployedContracts.BancorNetworkV1.deployed();
    const bntGovernance = await DeployedContracts.BNTGovernance.deployed();
    const vbntGovernance = await DeployedContracts.VBNTGovernance.deployed();
    const networkSettings = await DeployedContracts.NetworkSettingsV1.deployed();
    const masterVault = await DeployedContracts.MasterVault.deployed();
    const externalProtectionVault = await DeployedContracts.ExternalProtectionVault.deployed();
    const externalRewardsVault = await DeployedContracts.ExternalRewardsVault.deployed();
    const bntPool = await DeployedContracts.BNTPool.deployed();
    const pendingWithdrawals = await DeployedContracts.PendingWithdrawals.deployed();
    const poolMigrator = await DeployedContracts.PoolMigrator.deployed();

    await deployProxy({
        name: ContractName.BancorNetworkInfo,
        from: deployer,
        args: [
            network.address,
            bntGovernance.address,
            vbntGovernance.address,
            networkSettings.address,
            masterVault.address,
            externalProtectionVault.address,
            externalRewardsVault.address,
            bntPool.address,
            pendingWithdrawals.address,
            poolMigrator.address
        ]
    });

    return true;
};

func.id = DeploymentTag.BancorNetworkInfoV1;
func.dependencies = [
    DeploymentTag.V2,
    DeploymentTag.ProxyAdmin,
    DeploymentTag.BancorNetworkV1,
    DeploymentTag.NetworkSettingsV1,
    DeploymentTag.MasterVaultV1,
    DeploymentTag.ExternalProtectionVaultV1,
    DeploymentTag.ExternalRewardsVaultV1,
    DeploymentTag.BNTPoolV1,
    DeploymentTag.PendingWithdrawalsV1,
    DeploymentTag.PoolMigratorV1
];
func.tags = [DeploymentTag.V3, DeploymentTag.BancorNetworkInfoV1];

export default func;
