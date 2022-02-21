import { ContractName, DeploymentTag, deployProxy, DeployedContracts } from '../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const network = await DeployedContracts.BancorNetworkV1.deployed();
    const bntGovernance = await DeployedContracts.BNTGovernance.deployed();
    const vbntGovernance = await DeployedContracts.VBNTGovernance.deployed();
    const networkSettings = await DeployedContracts.NetworkSettingsV1.deployed();
    const omniVault = await DeployedContracts.OmniVaultV1.deployed();
    const externalProtectionVault = await DeployedContracts.ExternalProtectionVaultV1.deployed();
    const externalRewardsVault = await DeployedContracts.ExternalRewardsVaultV1.deployed();
    const omniPool = await DeployedContracts.OmniPoolV1.deployed();
    const pendingWithdrawals = await DeployedContracts.PendingWithdrawalsV1.deployed();
    const poolCollectionUpgrader = await DeployedContracts.PoolCollectionUpgraderV1.deployed();

    await deployProxy({
        name: ContractName.BancorNetworkInfoV1,
        from: deployer,
        args: [
            network.address,
            bntGovernance.address,
            vbntGovernance.address,
            networkSettings.address,
            omniVault.address,
            externalProtectionVault.address,
            externalRewardsVault.address,
            omniPool.address,
            pendingWithdrawals.address,
            poolCollectionUpgrader.address
        ]
    });

    return true;
};

func.id = ContractName.BancorNetworkInfoV1;
func.dependencies = [
    DeploymentTag.V2,
    ContractName.ProxyAdmin,
    ContractName.BancorNetworkV1,
    ContractName.NetworkSettingsV1,
    ContractName.OmniVaultV1,
    ContractName.ExternalProtectionVaultV1,
    ContractName.ExternalRewardsVaultV1,
    ContractName.OmniPoolV1,
    ContractName.PendingWithdrawalsV1,
    ContractName.PoolCollectionUpgraderV1
];
func.tags = [DeploymentTag.V3, ContractName.BancorNetworkInfoV1];

export default func;
