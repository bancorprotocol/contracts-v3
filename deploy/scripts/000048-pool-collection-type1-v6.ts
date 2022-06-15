import { NETWORK_FEE_PPM } from '../../utils/Constants';
import {
    deploy,
    DeployedContracts,
    execute,
    InstanceName,
    setDeploymentMetadata,
    upgradeProxy
} from '../../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const network = await DeployedContracts.BancorNetwork.deployed();
    const bnt = await DeployedContracts.BNT.deployed();
    const bntPool = await DeployedContracts.BNTPool.deployed();
    const networkSettings = await DeployedContracts.NetworkSettings.deployed();
    const masterVault = await DeployedContracts.MasterVault.deployed();

    await upgradeProxy({
        name: InstanceName.PoolMigrator,
        args: [network.address],
        from: deployer
    });

    const externalProtectionVault = await DeployedContracts.ExternalProtectionVault.deployed();
    const poolTokenFactory = await DeployedContracts.PoolTokenFactory.deployed();
    const poolMigrator = await DeployedContracts.PoolMigrator.deployed();

    const newPoolCollectionAddress = await deploy({
        name: InstanceName.PoolCollectionType1V6,
        contract: 'PoolCollection',
        from: deployer,
        args: [
            network.address,
            bnt.address,
            networkSettings.address,
            masterVault.address,
            bntPool.address,
            externalProtectionVault.address,
            poolTokenFactory.address,
            poolMigrator.address,
            NETWORK_FEE_PPM
        ]
    });

    await execute({
        name: InstanceName.BancorNetwork,
        methodName: 'registerPoolCollection',
        args: [newPoolCollectionAddress],
        from: deployer
    });

    const pools = await network.liquidityPools();

    await execute({
        name: InstanceName.BancorNetwork,
        methodName: 'migratePools',
        args: [pools, newPoolCollectionAddress],
        from: deployer
    });

    const prevPoolCollection = await DeployedContracts.PoolCollectionType1V5.deployed();

    await execute({
        name: InstanceName.BancorNetwork,
        methodName: 'unregisterPoolCollection',
        args: [prevPoolCollection.address],
        from: deployer
    });

    return true;
};

export default setDeploymentMetadata(__filename, func);
