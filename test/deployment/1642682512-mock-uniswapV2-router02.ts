import { MockUniswapV2Router02 } from '../../components/Contracts';
import { ContractName, DeployedContracts } from '../../utils/Deploy';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';

describeDeployment('1642682512-mock-uniswapV2-router02', ContractName.MockUniswapV2Router02V1, () => {
    let migration: MockUniswapV2Router02;

    beforeEach(async () => {
        migration = await DeployedContracts.MockUniswapV2Router02V1.deployed();
    });

    it('should deploy and configure the uninswap v2 router mock contract', async () => {
        expect(await migration.name()).to.eq(ContractName.MockUniswapV2Router02V1);
    });
});
