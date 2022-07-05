import { NETWORK_FEE_PPM } from '../../utils/Constants';
import {
    deploy,
    DeployedContracts,
    execute,
    InstanceName,
    setDeploymentMetadata
} from '../../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { chunk } from 'lodash';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const network = await DeployedContracts.BancorNetwork.deployed();
    const bnt = await DeployedContracts.BNT.deployed();
    const bntPool = await DeployedContracts.BNTPool.deployed();
    const networkSettings = await DeployedContracts.NetworkSettings.deployed();
    const masterVault = await DeployedContracts.MasterVault.deployed();
    const externalProtectionVault = await DeployedContracts.ExternalProtectionVault.deployed();
    const poolTokenFactory = await DeployedContracts.PoolTokenFactory.deployed();
    const poolMigrator = await DeployedContracts.PoolMigrator.deployed();

    const newPoolCollectionAddress = await deploy({
        name: InstanceName.PoolCollectionType1V8,
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

    const prevPoolCollection = await DeployedContracts.PoolCollectionType1V7.deployed();

    await execute({
        name: InstanceName.PoolCollectionType1V8,
        methodName: 'enableProtection',
        args: [await prevPoolCollection.protectionEnabled()],
        from: deployer
    });

    const pools = await network.liquidityPools();

    for (const poolBatch of chunk(pools, 50)) {
        await execute({
            name: InstanceName.BancorNetwork,
            methodName: 'migratePools',
            args: [poolBatch, newPoolCollectionAddress],
            from: deployer
        });
    }

    await execute({
        name: InstanceName.BancorNetwork,
        methodName: 'unregisterPoolCollection',
        args: [prevPoolCollection.address],
        from: deployer
    });

    return true;
};

export default setDeploymentMetadata(__filename, func);
