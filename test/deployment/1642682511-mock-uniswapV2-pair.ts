import { MockUniswapV2Pair } from '../../components/Contracts';
import { ContractName, DeployedContracts } from '../../utils/Deploy';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';

describeDeployment('1642682511-mock-uniswapV2-pair', ContractName.MockUniswapV2PairV1, () => {
    let migration: MockUniswapV2Pair;

    beforeEach(async () => {
        migration = await DeployedContracts.MockUniswapV2PairV1.deployed();
    });

    it('should deploy and configure the Uniswap v2 pair mock contract', async () => {
        expect(await migration.name()).to.eq(ContractName.MockUniswapV2PairV1);
    });
});
