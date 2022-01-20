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

    const networkTokenData = new TokenData(TokenSymbol.BNT);
    const networkToken = await deploy({
        name: ContractName.NetworkToken,
        contract: 'SmartToken',
        args: [networkTokenData.name(), networkTokenData.symbol(), networkTokenData.decimals()],
        from: deployer
    });

    const networkTokenGovernance = await deploy({
        name: ContractName.NetworkTokenGovernance,
        contract: 'TokenGovernance',
        args: [networkToken],
        from: deployer
    });

    await execute({
        name: ContractName.NetworkTokenGovernance,
        methodName: 'grantRole',
        args: [Roles.TokenGovernance.ROLE_SUPERVISOR, foundationMultisig],
        from: deployer
    });

    await execute({
        name: ContractName.NetworkTokenGovernance,
        methodName: 'revokeRole',
        args: [Roles.TokenGovernance.ROLE_SUPERVISOR, deployer],
        from: deployer
    });

    await execute({
        name: ContractName.NetworkTokenGovernance,
        methodName: 'grantRole',
        args: [Roles.TokenGovernance.ROLE_SUPERVISOR, foundationMultisig],
        from: foundationMultisig
    });

    await execute({
        name: ContractName.NetworkTokenGovernance,
        methodName: 'grantRole',
        args: [Roles.TokenGovernance.ROLE_GOVERNOR, deployer],
        from: foundationMultisig
    });

    await execute({
        name: ContractName.NetworkToken,
        methodName: 'transferOwnership',
        args: [networkTokenGovernance],
        from: deployer
    });

    await execute({
        name: ContractName.NetworkTokenGovernance,
        methodName: 'acceptTokenOwnership',
        from: foundationMultisig
    });

    await execute({
        name: ContractName.NetworkTokenGovernance,
        methodName: 'grantRole',
        args: [Roles.TokenGovernance.ROLE_MINTER, deployer],
        from: deployer
    });

    await execute({
        name: ContractName.NetworkTokenGovernance,
        methodName: 'mint',
        args: [deployer, TOTAL_SUPPLY],
        from: deployer
    });

    return true;
};

func.id = ContractName.NetworkToken;
func.skip = async () => isMainnet();
func.tags = [DeploymentTag.V2, ContractName.NetworkToken, ContractName.NetworkTokenGovernance];

export default func;
