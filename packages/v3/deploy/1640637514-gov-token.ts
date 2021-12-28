import { vBNT, DEFAULT_DECIMALS } from '../utils/Constants';
import { ContractId, deploy, execute } from '../utils/Deploy';
import { roles } from '../utils/Roles';
import { toWei } from '../utils/Types';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const { TokenGovernance: TokenGovernanceRoles } = roles;

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const TOTAL_SUPPLY = toWei(1_000_000_000);

    const govToken = await deploy({
        id: ContractId.GovToken,
        contract: 'SmartToken',
        args: [vBNT, vBNT, DEFAULT_DECIMALS],
        from: deployer
    });

    const govTokenGovernance = await deploy({
        id: ContractId.GovTokenGovernance,
        contract: 'TokenGovernance',
        args: [govToken],
        from: deployer
    });

    await execute({
        id: ContractId.GovTokenGovernance,
        methodName: 'grantRole',
        args: [TokenGovernanceRoles.ROLE_GOVERNOR, deployer],
        from: deployer
    });

    await execute({
        id: ContractId.GovTokenGovernance,
        methodName: 'grantRole',
        args: [TokenGovernanceRoles.ROLE_MINTER, deployer],
        from: deployer
    });

    await execute({
        id: ContractId.GovToken,
        methodName: 'transferOwnership',
        args: [govTokenGovernance],
        from: deployer
    });

    await execute({
        id: ContractId.GovTokenGovernance,
        methodName: 'acceptTokenOwnership',
        from: deployer
    });

    await execute({
        id: ContractId.GovTokenGovernance,
        methodName: 'mint',
        args: [deployer, TOTAL_SUPPLY],
        from: deployer
    });
};

export default func;
