import { ContractName, DeploymentTag } from '../utils/Constants';
import { execute, save, DeployedContracts } from '../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const EVENT_NAME = 'PoolTokenCreated';
interface PoolTokenCreated {
    event: string;
    args: {
        poolToken: string;
        reserveToken: string;
    };
}

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { daoMultisig } = await getNamedAccounts();

    const networkToken = await DeployedContracts.NetworkToken.deployed();

    const { events } = await execute({
        name: ContractName.PoolTokenFactory,
        methodName: 'createPoolToken',
        args: [networkToken.address],
        from: daoMultisig
    });

    const event = events![1] as PoolTokenCreated;
    if (!event || event.event !== EVENT_NAME || event.args.reserveToken !== networkToken.address) {
        throw new Error(`Unable to find the ${EVENT_NAME} event`);
    }

    await save({
        name: ContractName.MasterPoolToken,
        contract: 'PoolToken',
        address: event.args.poolToken
    });

    await execute({
        name: ContractName.MasterPoolToken,
        methodName: 'acceptOwnership',
        from: daoMultisig
    });

    return true;
};

func.id = ContractName.MasterPoolToken;
func.dependencies = [DeploymentTag.V2, ContractName.PoolTokenFactory];
func.tags = [DeploymentTag.V3, ContractName.MasterPoolToken];

export default func;
