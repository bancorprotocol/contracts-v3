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

    // get the deployed contracts
    const externalProtectionVault = await DeployedContracts.ExternalProtectionVault.deployed();
    const masterVault = await DeployedContracts.MasterVault.deployed();
    const networkSettings = await DeployedContracts.NetworkSettings.deployed();
    const bntGovernance = await DeployedContracts.BNTGovernance.deployed();
    const vbntGovernance = await DeployedContracts.VBNTGovernance.deployed();
    const bnBNT = await DeployedContracts.bnBNT.deployed();
    const bancorArbitrage = await DeployedContracts.BancorArbitrage.deployed();

    const network = await DeployedContracts.BancorNetwork.deployed();
    const bnt = await DeployedContracts.BNT.deployed();
    const bntPool = await DeployedContracts.BNTPool.deployed();
    const poolTokenFactory = await DeployedContracts.PoolTokenFactory.deployed();
    const poolMigrator = await DeployedContracts.PoolMigrator.deployed();
    const prevPoolCollection = await DeployedContracts.PoolCollectionType1V10.deployed();

    // pause the network
    await execute({
        name: InstanceName.BancorNetwork,
        methodName: 'pause',
        from: deployer
    });

    // upgrade the BancorNetwork contract
    await upgradeProxy({
        name: InstanceName.BancorNetwork,
        args: [
            bntGovernance.address,
            vbntGovernance.address,
            networkSettings.address,
            masterVault.address,
            externalProtectionVault.address,
            bnBNT.address,
            bancorArbitrage.address
        ],
        from: deployer
    });

    // deploy the new pool collection contract
    const newPoolCollectionAddress = await deploy({
        name: InstanceName.PoolCollectionType1V11,
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

    // set the network fee for the new pool collection
    await execute({
        name: InstanceName.PoolCollectionType1V11,
        methodName: 'setNetworkFeePPM',
        args: [await prevPoolCollection.networkFeePPM()],
        from: deployer
    });

    // register the new pool collection with the network
    await execute({
        name: InstanceName.BancorNetwork,
        methodName: 'registerPoolCollection',
        args: [newPoolCollectionAddress],
        from: deployer
    });

    const pools = await network.liquidityPools();

    // migrate the pools to the new pool collection
    for (const poolBatch of chunk(pools, 50)) {
        await execute({
            name: InstanceName.BancorNetwork,
            methodName: 'migratePools',
            args: [poolBatch, newPoolCollectionAddress],
            from: deployer
        });
    }

    // unregister the old pool collection
    await execute({
        name: InstanceName.BancorNetwork,
        methodName: 'unregisterPoolCollection',
        args: [prevPoolCollection.address],
        from: deployer
    });

    // resum the bancor network
    await execute({
        name: InstanceName.BancorNetwork,
        methodName: 'resume',
        from: deployer
    });

    return true;
};

export default setDeploymentMetadata(__filename, func);
