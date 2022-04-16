import {
    deploy,
    DeployedContracts,
    execute,
    grantRole,
    InstanceName,
    isLive,
    isMainnetFork,
    revokeRole,
    setDeploymentMetadata
} from '../utils/Deploy';
import { Roles } from '../utils/Roles';
import { TokenData, TokenSymbol } from '../utils/TokenData';
import { toWei } from '../utils/Types';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const INITIAL_SUPPLY = toWei(1_000_000_000);

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer, foundationMultisig } = await getNamedAccounts();

    // if we're running on a live production, just ensure that the deployer received the required roles and permissions
    if (isLive()) {
        const bntGovernance = await DeployedContracts.BNTGovernance.deployed();
        if (!(await bntGovernance.hasRole(Roles.TokenGovernance.ROLE_GOVERNOR, deployer))) {
            throw new Error('Missing ROLE_GOVERNOR role!');
        }

        return true;
    }

    // simulate all the required roles and permissions on a mainnet fork
    if (isMainnetFork()) {
        await grantRole({
            name: InstanceName.BNTGovernance,
            id: Roles.TokenGovernance.ROLE_GOVERNOR,
            member: deployer,
            from: foundationMultisig
        });

        return true;
    }

    const bntData = new TokenData(TokenSymbol.BNT);
    const bnt = await deploy({
        name: InstanceName.BNT,
        contract: 'SmartToken',
        args: [bntData.name(), bntData.symbol(), bntData.decimals()],
        from: deployer
    });

    const bntGovernance = await deploy({
        name: InstanceName.BNTGovernance,
        contract: 'TokenGovernance',
        args: [bnt],
        from: deployer
    });

    await grantRole({
        name: InstanceName.BNTGovernance,
        id: Roles.TokenGovernance.ROLE_SUPERVISOR,
        member: foundationMultisig,
        from: deployer
    });

    await grantRole({
        name: InstanceName.BNTGovernance,
        id: Roles.TokenGovernance.ROLE_GOVERNOR,
        member: deployer,
        from: deployer
    });

    await revokeRole({
        name: InstanceName.BNTGovernance,
        id: Roles.TokenGovernance.ROLE_SUPERVISOR,
        member: deployer,
        from: deployer
    });

    await execute({
        name: InstanceName.BNT,
        methodName: 'transferOwnership',
        args: [bntGovernance],
        from: deployer
    });

    await execute({
        name: InstanceName.BNTGovernance,
        methodName: 'acceptTokenOwnership',
        from: foundationMultisig
    });

    await grantRole({
        name: InstanceName.BNTGovernance,
        id: Roles.TokenGovernance.ROLE_MINTER,
        member: deployer,
        from: deployer
    });

    await execute({
        name: InstanceName.BNTGovernance,
        methodName: 'mint',
        args: [deployer, INITIAL_SUPPLY],
        from: deployer
    });

    await revokeRole({
        name: InstanceName.BNTGovernance,
        id: Roles.TokenGovernance.ROLE_MINTER,
        member: deployer,
        from: deployer
    });

    return true;
};

export default setDeploymentMetadata(__filename, func);
