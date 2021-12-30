import { Symbols, TokenNames, DEFAULT_DECIMALS, ContractNames, DeploymentTags } from '../utils/Constants';
import { deploy, execute, isMainnet } from '../utils/Deploy';
import { Roles } from '../utils/Roles';
import { toWei } from '../utils/Types';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer, foundationMultisig } = await getNamedAccounts();

    const TOTAL_SUPPLY = toWei(1_000_000_000);

    const govToken = await deploy({
        name: ContractNames.GovToken,
        contract: 'DSToken',
        args: [TokenNames.vBNT, Symbols.vBNT, DEFAULT_DECIMALS],
        from: deployer
    });

    const govTokenGovernance = await deploy({
        name: ContractNames.GovTokenGovernance,
        contract: 'TokenGovernance',
        args: [govToken],
        from: deployer
    });

    await execute({
        name: ContractNames.GovTokenGovernance,
        methodName: 'grantRole',
        args: [Roles.TokenGovernance.ROLE_SUPERVISOR, foundationMultisig],
        from: deployer
    });

    await execute({
        name: ContractNames.GovTokenGovernance,
        methodName: 'revokeRole',
        args: [Roles.TokenGovernance.ROLE_SUPERVISOR, deployer],
        from: deployer
    });

    await execute({
        name: ContractNames.GovTokenGovernance,
        methodName: 'grantRole',
        args: [Roles.TokenGovernance.ROLE_SUPERVISOR, foundationMultisig],
        from: foundationMultisig
    });

    await execute({
        name: ContractNames.GovTokenGovernance,
        methodName: 'grantRole',
        args: [Roles.TokenGovernance.ROLE_GOVERNOR, deployer],
        from: foundationMultisig
    });

    await execute({
        name: ContractNames.GovToken,
        methodName: 'transferOwnership',
        args: [govTokenGovernance],
        from: deployer
    });

    await execute({
        name: ContractNames.GovTokenGovernance,
        methodName: 'acceptTokenOwnership',
        from: foundationMultisig
    });

    await execute({
        name: ContractNames.GovTokenGovernance,
        methodName: 'grantRole',
        args: [Roles.TokenGovernance.ROLE_MINTER, deployer],
        from: deployer
    });

    await execute({
        name: ContractNames.GovTokenGovernance,
        methodName: 'mint',
        args: [deployer, TOTAL_SUPPLY],
        from: deployer
    });
};

func.skip = async () => isMainnet();
func.tags = [DeploymentTags.V2];

export default func;
