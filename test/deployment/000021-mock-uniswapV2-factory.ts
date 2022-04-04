import { MockUniswapV2Factory } from '../../components/Contracts';
import { ContractInstance, DeployedContracts, isMainnet } from '../../utils/Deploy';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';

describeDeployment(
    __filename,
    () => {
        let migration: MockUniswapV2Factory;

        beforeEach(async () => {
            migration = await DeployedContracts.MockUniswapV2Factory.deployed();
        });

        it('should deploy and configure the uniswap v2 factory mock contract', async () => {
            expect(await migration.name()).to.equal(ContractInstance.MockUniswapV2Factory);
        });
    },
    () => isMainnet()
);
