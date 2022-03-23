import { MockUniswapV2Factory } from '../../components/Contracts';
import { ContractName, DeployedContracts, isMainnet } from '../../utils/Deploy';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';

describeDeployment(
    '1642682513-mock-uniswapV2-factory',
    ContractName.MockUniswapV2FactoryV1,
    () => {
        let migration: MockUniswapV2Factory;

        beforeEach(async () => {
            migration = await DeployedContracts.MockUniswapV2FactoryV1.deployed();
        });

        it('should deploy and configure the uniswap v2 factory mock contract', async () => {
            expect(await migration.name()).to.equal(ContractName.MockUniswapV2FactoryV1);
        });
    },
    () => isMainnet()
);
