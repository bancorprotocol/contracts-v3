import { ContractName, DeployedContracts, DeploymentTag, upgradeProxy } from '../utils/Deploy';
import CreateTestNetwork from './1642682517-create-test-network';
import CreateNativePool from './1642682519-create-native-pool';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const bntGovernance = await DeployedContracts.BNTGovernance.deployed();
    const vbntGovernance = await DeployedContracts.VBNTGovernance.deployed();
    const networkSettings = await DeployedContracts.NetworkSettings.deployed();
    const masterVault = await DeployedContracts.MasterVault.deployed();
    const externalProtectionVault = await DeployedContracts.ExternalProtectionVault.deployed();
    const bntPoolToken = await DeployedContracts.BNTPoolToken.deployed();

    await upgradeProxy({
        name: ContractName.BancorNetwork,
        args: [
            bntGovernance.address,
            vbntGovernance.address,
            networkSettings.address,
            masterVault.address,
            externalProtectionVault.address,
            bntPoolToken.address
        ],
        from: deployer
    });

    return true;
};

func.id = DeploymentTag.BancorNetworkV2;
func.dependencies = [
    DeploymentTag.BancorNetworkV1,
    DeploymentTag.NetworkSettingsV2,
    DeploymentTag.PoolCollectionType1V1,
    CreateTestNetwork.id!,
    CreateNativePool.id!
];
func.tags = [DeploymentTag.V3, DeploymentTag.BancorNetworkV2];

export default func;
