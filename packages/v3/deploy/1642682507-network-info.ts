import { ContractName, DeploymentTag } from '../utils/Constants';
import { deployProxy, DeployedContracts } from '../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const network = await DeployedContracts.BancorNetwork.deployed();
    const networkTokenGovernance = await DeployedContracts.NetworkTokenGovernance.deployed();
    const govTokenGovernance = await DeployedContracts.GovTokenGovernance.deployed();
    const networkSettings = await DeployedContracts.NetworkSettings.deployed();
    const masterVault = await DeployedContracts.MasterVault.deployed();
    const externalProtectionVault = await DeployedContracts.ExternalProtectionVault.deployed();
    const externalRewardsVault = await DeployedContracts.ExternalRewardsVault.deployed();
    const masterPool = await DeployedContracts.MasterPool.deployed();
    const pendingWithdrawals = await DeployedContracts.PendingWithdrawals.deployed();
    const poolCollectionUpgrader = await DeployedContracts.PoolCollectionUpgrader.deployed();

    await deployProxy({
        name: ContractName.BancorNetworkInfo,
        from: deployer,
        args: [
            network.address,
            networkTokenGovernance.address,
            govTokenGovernance.address,
            networkSettings.address,
            masterVault.address,
            externalProtectionVault.address,
            externalRewardsVault.address,
            masterPool.address,
            pendingWithdrawals.address,
            poolCollectionUpgrader.address
        ]
    });

    return true;
};

func.id = ContractName.BancorNetworkInfo;
func.dependencies = [
    DeploymentTag.V2,
    ContractName.ProxyAdmin,
    ContractName.BancorNetwork,
    ContractName.NetworkSettings,
    ContractName.MasterVault,
    ContractName.ExternalProtectionVault,
    ContractName.ExternalRewardsVault,
    ContractName.MasterPool,
    ContractName.PendingWithdrawals,
    ContractName.PoolCollectionUpgrader
];
func.tags = [DeploymentTag.V3, ContractName.BancorNetworkInfo];

export default func;
