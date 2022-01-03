import { ContractName, DeploymentTag } from '../utils/Constants';
import { deploy, execute, isMainnet } from '../utils/Deploy';
import { Roles } from '../utils/Roles';
import { TokenData, TokenSymbol } from '../utils/TokenData';
import { toWei } from '../utils/Types';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const TOTAL_SUPPLY = toWei(1_000_000_000);

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer, foundationMultisig } = await getNamedAccounts();

    const govTokenData = new TokenData(TokenSymbol.vBNT);
    const govToken = await deploy({
        name: ContractName.GovToken,
        contract: 'DSToken',
        args: [govTokenData.name(), govTokenData.symbol(), govTokenData.decimals()],
        from: deployer
    });

    const govTokenGovernance = await deploy({
        name: ContractName.GovTokenGovernance,
        contract: 'TokenGovernance',
        args: [govToken],
        from: deployer
    });

    await execute({
        name: ContractName.GovTokenGovernance,
        methodName: 'grantRole',
        args: [Roles.TokenGovernance.ROLE_SUPERVISOR, foundationMultisig],
        from: deployer
    });

    await execute({
        name: ContractName.GovTokenGovernance,
        methodName: 'revokeRole',
        args: [Roles.TokenGovernance.ROLE_SUPERVISOR, deployer],
        from: deployer
    });

    await execute({
        name: ContractName.GovTokenGovernance,
        methodName: 'grantRole',
        args: [Roles.TokenGovernance.ROLE_SUPERVISOR, foundationMultisig],
        from: foundationMultisig
    });

    await execute({
        name: ContractName.GovTokenGovernance,
        methodName: 'grantRole',
        args: [Roles.TokenGovernance.ROLE_GOVERNOR, deployer],
        from: foundationMultisig
    });

    await execute({
        name: ContractName.GovToken,
        methodName: 'transferOwnership',
        args: [govTokenGovernance],
        from: deployer
    });

    await execute({
        name: ContractName.GovTokenGovernance,
        methodName: 'acceptTokenOwnership',
        from: foundationMultisig
    });

    await execute({
        name: ContractName.GovTokenGovernance,
        methodName: 'grantRole',
        args: [Roles.TokenGovernance.ROLE_MINTER, deployer],
        from: deployer
    });

    await execute({
        name: ContractName.GovTokenGovernance,
        methodName: 'mint',
        args: [deployer, TOTAL_SUPPLY],
        from: deployer
    });
};

func.skip = async () => isMainnet();
func.tags = [DeploymentTag.V2, ContractName.GovToken, ContractName.GovTokenGovernance];

export default func;
