import { ContractInstance, DeployedContracts, execute, save, setDeploymentMetadata } from '../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

interface PoolTokenCreated {
    event: string;
    args: {
        poolToken: string;
        reserveToken: string;
    };
}

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const bnt = await DeployedContracts.BNT.deployed();

    const { events } = await execute({
        name: ContractInstance.PoolTokenFactory,
        methodName: 'createPoolToken',
        args: [bnt.address],
        from: deployer
    });

    const event = events![1] as PoolTokenCreated;
    const poolTokenAddress = event.args.poolToken;

    await save({
        name: ContractInstance.BNTPoolToken,
        contract: 'PoolToken',
        address: poolTokenAddress
    });

    await execute({
        name: ContractInstance.BNTPoolToken,
        methodName: 'acceptOwnership',
        from: deployer
    });

    return true;
};

setDeploymentMetadata(__filename, func);

export default func;
