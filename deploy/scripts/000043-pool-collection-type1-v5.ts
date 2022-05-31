import {
    deploy,
    DeployedContracts,
    execute,
    InstanceName,
    setDeploymentMetadata,
    upgradeProxy
} from '../../utils/Deploy';
import { NATIVE_TOKEN_ADDRESS } from '../../utils/TokenData';
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
        name: InstanceName.PoolCollectionType1V5,
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
            poolMigrator.address
        ]
    });

    await execute({
        name: InstanceName.BancorNetwork,
        methodName: 'addPoolCollection',
        args: [newPoolCollectionAddress],
        from: deployer
    });

    const { dai, link } = await getNamedAccounts();

    await execute({
        name: InstanceName.BancorNetwork,
        methodName: 'migratePools',
        args: [[NATIVE_TOKEN_ADDRESS, dai, link]],
        from: deployer
    });

    const prevPoolCollection = await DeployedContracts.PoolCollectionType1V4.deployed();

    await execute({
        name: InstanceName.BancorNetwork,
        methodName: 'removePoolCollection',
        args: [prevPoolCollection.address, newPoolCollectionAddress],
        from: deployer
    });

    return true;
};

export default setDeploymentMetadata(__filename, func);
