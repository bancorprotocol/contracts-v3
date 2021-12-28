import { BNT, DEFAULT_DECIMALS } from '../utils/Constants';
import { ContractId, Tags, deploy, execute } from '../utils/Deploy';
import { roles } from '../utils/Roles';
import { toWei } from '../utils/Types';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const { TokenGovernance: TokenGovernanceRoles } = roles;

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const TOTAL_SUPPLY = toWei(1_000_000_000);

    const networkToken = await deploy({
        id: ContractId.NetworkToken,
        contract: 'SmartToken',
        args: [BNT, BNT, DEFAULT_DECIMALS],
        from: deployer
    });

    const networkTokenGovernance = await deploy({
        id: ContractId.NetworkTokenGovernance,
        contract: 'TokenGovernance',
        args: [networkToken],
        from: deployer
    });

    await execute({
        id: ContractId.NetworkTokenGovernance,
        methodName: 'grantRole',
        args: [TokenGovernanceRoles.ROLE_GOVERNOR, deployer],
        from: deployer
    });

    await execute({
        id: ContractId.NetworkTokenGovernance,
        methodName: 'grantRole',
        args: [TokenGovernanceRoles.ROLE_MINTER, deployer],
        from: deployer
    });

    await execute({
        id: ContractId.NetworkToken,
        methodName: 'transferOwnership',
        args: [networkTokenGovernance],
        from: deployer
    });

    await execute({
        id: ContractId.NetworkTokenGovernance,
        methodName: 'acceptTokenOwnership',
        from: deployer
    });

    await execute({
        id: ContractId.NetworkTokenGovernance,
        methodName: 'mint',
        args: [deployer, TOTAL_SUPPLY],
        from: deployer
    });
};

func.tags = [Tags.V2];

export default func;
