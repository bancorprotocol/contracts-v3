import { MockUniswapV2Pair } from '../../components/Contracts';
import { ContractName, DeployedContracts, DeploymentTag, isMainnet } from '../../utils/Deploy';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';

describeDeployment(
    '1642682511-mock-uniswapV2-pair',
    DeploymentTag.MockUniswapV2Pair,
    () => {
        let migration: MockUniswapV2Pair;

        beforeEach(async () => {
            migration = await DeployedContracts.MockUniswapV2Pair.deployed();
        });

        it('should deploy and configure the Uniswap v2 pair mock contract', async () => {
            expect(await migration.name()).to.eq(ContractName.MockUniswapV2Pair);
        });
    },
    () => isMainnet()
);
