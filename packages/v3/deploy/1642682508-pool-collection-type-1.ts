import { ContractName, DeploymentTag } from '../utils/Constants';
import { deploy, execute, DeployedContracts } from '../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer, daoMultisig } = await getNamedAccounts();

    const network = await DeployedContracts.BancorNetwork.deployed();
    const networkToken = await DeployedContracts.NetworkToken.deployed();
    const networkSettings = await DeployedContracts.NetworkSettings.deployed();
    const masterVault = await DeployedContracts.MasterVault.deployed();

    const masterPool = await DeployedContracts.MasterPool.deployed();
    const externalProtectionVault = await DeployedContracts.ExternalProtectionVault.deployed();
    const poolTokenFactory = await DeployedContracts.PoolTokenFactory.deployed();
    const poolCollectionUpgrader = await DeployedContracts.PoolCollectionUpgrader.deployed();

    const poolCollectionAddress = await deploy({
        name: ContractName.PoolCollectionType1,
        contract: 'PoolCollection',
        from: deployer,
        args: [
            network.address,
            networkToken.address,
            networkSettings.address,
            masterVault.address,
            masterPool.address,
            externalProtectionVault.address,
            poolTokenFactory.address,
            poolCollectionUpgrader.address
        ]
    });

    await execute({
        name: ContractName.BancorNetwork,
        methodName: 'addPoolCollection',
        args: [poolCollectionAddress],
        from: daoMultisig
    });

    return true;
};

func.id = ContractName.PoolCollectionType1;
func.dependencies = [
    DeploymentTag.V2,
    ContractName.BancorNetwork,
    ContractName.NetworkSettings,
    ContractName.MasterVault,
    ContractName.MasterPool,
    ContractName.ExternalProtectionVault,
    ContractName.PoolTokenFactory,
    ContractName.PendingWithdrawals,
    ContractName.PoolCollectionUpgrader
];
func.tags = [DeploymentTag.V3, ContractName.PoolCollectionType1];

export default func;
