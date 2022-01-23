import { ContractName, DeploymentTag } from '../utils/Constants';
import { deployProxy, DeployedContracts } from '../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const network = await DeployedContracts.BancorNetwork.deployed();
    const networkSettings = await DeployedContracts.NetworkSettings.deployed();
    const networkToken = await DeployedContracts.NetworkToken.deployed();
    const masterPool = await DeployedContracts.MasterPool.deployed();

    await deployProxy({
        name: ContractName.AutoCompoundingStakingRewards,
        from: deployer,
        args: [network.address, networkSettings.address, networkToken.address, masterPool.address]
    });

    return true;
};

func.id = ContractName.AutoCompoundingStakingRewards;
func.dependencies = [
    DeploymentTag.V2,
    ContractName.ProxyAdmin,
    ContractName.BancorNetwork,
    ContractName.NetworkSettings,
    ContractName.MasterPool
];
func.tags = [DeploymentTag.V3, ContractName.AutoCompoundingStakingRewards];

export default func;
