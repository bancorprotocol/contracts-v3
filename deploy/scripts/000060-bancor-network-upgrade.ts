import {
    DeployedContracts,
    execute,
    grantRole,
    InstanceName,
    setDeploymentMetadata,
    upgradeProxy
} from '../../utils/Deploy';
import { Roles } from '../../utils/Roles';
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

    // deploy and configure the new BancorNetwork contract
    const externalProtectionVault = await DeployedContracts.ExternalProtectionVault.deployed();
    const masterVault = await DeployedContracts.MasterVault.deployed();
    const networkSettings = await DeployedContracts.NetworkSettings.deployed();
    const bntGovernance = await DeployedContracts.BNTGovernance.deployed();
    const vbntGovernance = await DeployedContracts.VBNTGovernance.deployed();
    const bnBNT = await DeployedContracts.bnBNT.deployed();
    const bancorArbitrage = await DeployedContracts.BancorArbitrage.deployed();

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

    await execute({
        name: InstanceName.BancorNetwork,
        methodName: 'resume',
        from: deployer
    });

    return true;
};

export default setDeploymentMetadata(__filename, func);