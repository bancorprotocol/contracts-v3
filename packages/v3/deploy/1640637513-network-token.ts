import { BNT, DEFAULT_DECIMALS } from '../utils/Constants';
import { ContractIds, Tags, deploy, execute, isMainnet } from '../utils/Deploy';
import { roles } from '../utils/Roles';
import { toWei } from '../utils/Types';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const { TokenGovernance: TokenGovernanceRoles } = roles;

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer, foundationMultisig } = await getNamedAccounts();

    const TOTAL_SUPPLY = toWei(1_000_000_000);

    const networkToken = await deploy({
        id: ContractIds.NetworkToken,
        contract: 'SmartToken',
        args: [BNT, BNT, DEFAULT_DECIMALS],
        from: deployer
    });

    const networkTokenGovernance = await deploy({
        id: ContractIds.NetworkTokenGovernance,
        contract: 'TokenGovernance',
        args: [networkToken],
        from: deployer
    });

    await execute({
        id: ContractIds.NetworkTokenGovernance,
        methodName: 'grantRole',
        args: [TokenGovernanceRoles.ROLE_SUPERVISOR, foundationMultisig],
        from: deployer
    });

    await execute({
        id: ContractIds.NetworkTokenGovernance,
        methodName: 'revokeRole',
        args: [TokenGovernanceRoles.ROLE_SUPERVISOR, deployer],
        from: deployer
    });

    await execute({
        id: ContractIds.NetworkTokenGovernance,
        methodName: 'grantRole',
        args: [TokenGovernanceRoles.ROLE_SUPERVISOR, foundationMultisig],
        from: foundationMultisig
    });

    await execute({
        id: ContractIds.NetworkTokenGovernance,
        methodName: 'grantRole',
        args: [TokenGovernanceRoles.ROLE_GOVERNOR, deployer],
        from: foundationMultisig
    });

    await execute({
        id: ContractIds.NetworkToken,
        methodName: 'transferOwnership',
        args: [networkTokenGovernance],
        from: deployer
    });

    await execute({
        id: ContractIds.NetworkTokenGovernance,
        methodName: 'acceptTokenOwnership',
        from: foundationMultisig
    });

    if (!isMainnet()) {
        await execute({
            id: ContractIds.NetworkTokenGovernance,
            methodName: 'grantRole',
            args: [TokenGovernanceRoles.ROLE_MINTER, deployer],
            from: deployer
        });

        await execute({
            id: ContractIds.NetworkTokenGovernance,
            methodName: 'mint',
            args: [deployer, TOTAL_SUPPLY],
            from: deployer
        });
    }
};

func.tags = [Tags.V2];

export default func;
