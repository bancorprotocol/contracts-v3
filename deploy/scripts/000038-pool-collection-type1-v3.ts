import {
    deploy,
    DeployedContracts,
    execute,
    grantRole,
    InstanceName,
    setDeploymentMetadata,
    upgradeProxy
} from '../../utils/Deploy';
import { Roles } from '../../utils/Roles';
import { NATIVE_TOKEN_ADDRESS } from '../../utils/TokenData';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    await grantRole({
        name: InstanceName.BancorNetwork,
        id: Roles.BancorNetwork.ROLE_EMERGENCY_STOPPER,
        member: deployer,
        from: deployer
    });

    await execute({
        name: InstanceName.BancorNetwork,
        methodName: 'pause',
        from: deployer
    });

    // upgrade the PendingWithdrawals contract
    const network = await DeployedContracts.BancorNetwork.deployed();
    const bnt = await DeployedContracts.BNT.deployed();
    const bntPool = await DeployedContracts.BNTPool.deployed();

    const pendingWithdrawals = await upgradeProxy({
        name: InstanceName.PendingWithdrawals,
        args: [network.address, bnt.address, bntPool.address],
        from: deployer
    });

    // upgrade the BNTPool contract
    const bntGovernance = await DeployedContracts.BNTGovernance.deployed();
    const vbntGovernance = await DeployedContracts.VBNTGovernance.deployed();
    const networkSettings = await DeployedContracts.NetworkSettings.deployed();
    const masterVault = await DeployedContracts.MasterVault.deployed();
    const bnBNT = await DeployedContracts.bnBNT.deployed();

    await upgradeProxy({
        name: InstanceName.BNTPool,
        args: [
            network.address,
            bntGovernance.address,
            vbntGovernance.address,
            networkSettings.address,
            masterVault.address,
            bnBNT.address
        ],
        from: deployer
    });

    // upgrade the PoolMigrator contract
    await upgradeProxy({
        name: InstanceName.PoolMigrator,
        args: [network.address],
        from: deployer
    });

    // deploy and configure the new PoolCollection contract
    const externalProtectionVault = await DeployedContracts.ExternalProtectionVault.deployed();
    const poolTokenFactory = await DeployedContracts.PoolTokenFactory.deployed();
    const poolMigrator = await DeployedContracts.PoolMigrator.deployed();

    const newPoolCollectionAddress = await deploy({
        name: InstanceName.PoolCollectionType1V3,
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

    // upgrade the BancorNetwork contract
    await upgradeProxy({
        name: InstanceName.BancorNetwork,
        args: [
            bntGovernance.address,
            vbntGovernance.address,
            networkSettings.address,
            masterVault.address,
            externalProtectionVault.address,
            bnBNT.address
        ],
        from: deployer
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

    const prevPoolCollection = await DeployedContracts.PoolCollectionType1V2.deployed();

    await execute({
        name: InstanceName.BancorNetwork,
        methodName: 'removePoolCollection',
        args: [prevPoolCollection.address, newPoolCollectionAddress],
        from: deployer
    });

    // upgrade the BancorNetworkInfo contract
    const externalRewardsVault = await DeployedContracts.ExternalRewardsVault.deployed();

    await upgradeProxy({
        name: InstanceName.BancorNetworkInfo,
        from: deployer,
        args: [
            network.address,
            bntGovernance.address,
            vbntGovernance.address,
            networkSettings.address,
            masterVault.address,
            externalProtectionVault.address,
            externalRewardsVault.address,
            bntPool.address,
            pendingWithdrawals,
            poolMigrator.address
        ]
    });

    await execute({
        name: InstanceName.BancorNetwork,
        methodName: 'resume',
        from: deployer
    });

    return true;
};

export default setDeploymentMetadata(__filename, func);
