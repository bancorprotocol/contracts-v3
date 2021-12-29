import { vBNT, DEFAULT_DECIMALS } from '../utils/Constants';
import { ContractIds, Tags, deploy, execute, isMainnet } from '../utils/Deploy';
import { roles } from '../utils/Roles';
import { toWei } from '../utils/Types';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const { TokenGovernance: TokenGovernanceRoles } = roles;

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer, foundationMultisig } = await getNamedAccounts();

    const TOTAL_SUPPLY = toWei(1_000_000_000);

    const govToken = await deploy({
        id: ContractIds.GovToken,
        contract: 'DSToken',
        args: [vBNT, vBNT, DEFAULT_DECIMALS],
        from: deployer
    });

    const govTokenGovernance = await deploy({
        id: ContractIds.GovTokenGovernance,
        contract: 'TokenGovernance',
        args: [govToken],
        from: deployer
    });

    await execute({
        id: ContractIds.GovTokenGovernance,
        methodName: 'grantRole',
        args: [TokenGovernanceRoles.ROLE_SUPERVISOR, foundationMultisig],
        from: deployer
    });

    await execute({
        id: ContractIds.GovTokenGovernance,
        methodName: 'revokeRole',
        args: [TokenGovernanceRoles.ROLE_SUPERVISOR, deployer],
        from: deployer
    });

    await execute({
        id: ContractIds.GovTokenGovernance,
        methodName: 'grantRole',
        args: [TokenGovernanceRoles.ROLE_SUPERVISOR, foundationMultisig],
        from: foundationMultisig
    });

    await execute({
        id: ContractIds.GovTokenGovernance,
        methodName: 'grantRole',
        args: [TokenGovernanceRoles.ROLE_GOVERNOR, deployer],
        from: foundationMultisig
    });

    await execute({
        id: ContractIds.GovToken,
        methodName: 'transferOwnership',
        args: [govTokenGovernance],
        from: deployer
    });

    await execute({
        id: ContractIds.GovTokenGovernance,
        methodName: 'acceptTokenOwnership',
        from: foundationMultisig
    });

    if (!isMainnet()) {
        await execute({
            id: ContractIds.GovTokenGovernance,
            methodName: 'grantRole',
            args: [TokenGovernanceRoles.ROLE_MINTER, deployer],
            from: deployer
        });

        await execute({
            id: ContractIds.GovTokenGovernance,
            methodName: 'mint',
            args: [deployer, TOTAL_SUPPLY],
            from: deployer
        });
    }
};

func.tags = [Tags.V2];

export default func;
