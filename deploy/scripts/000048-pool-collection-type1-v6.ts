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

    const pools = await network.liquidityPools();

    for (const poolBatch of chunk(pools, 50)) {
        await execute({
            name: InstanceName.BancorNetwork,
            methodName: 'migratePools',
            args: [poolBatch, '0x05E29F07B9710368A1D5658750e9B4B478c15bB8'],
            from: deployer
        });
    }

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
