import { DeployedContracts, execute, InstanceName, save, setDeploymentMetadata } from '../../utils/Deploy';
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
        name: InstanceName.PoolTokenFactory,
        methodName: 'createPoolToken',
        args: [bnt.address],
        from: deployer
    });

    const event = events?.find((e) => e.event === 'PoolTokenCreated') as PoolTokenCreated;
    const poolTokenAddress = event.args.poolToken;

    await save({
        name: InstanceName.bnBNT,
        contract: 'PoolToken',
        address: poolTokenAddress,
        skipTypechain: true
    });

    await execute({
        name: InstanceName.bnBNT,
        methodName: 'acceptOwnership',
        from: deployer
    });

    return true;
};

export default setDeploymentMetadata(__filename, func);
