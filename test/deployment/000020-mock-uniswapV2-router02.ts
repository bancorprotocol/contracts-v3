import { MockUniswapV2Router02 } from '../../components/Contracts';
import { ContractInstance, DeployedContracts, isMainnet } from '../../utils/Deploy';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';

describeDeployment(
    __filename,
    () => {
        let migration: MockUniswapV2Router02;

        beforeEach(async () => {
            migration = await DeployedContracts.MockUniswapV2Router02.deployed();
        });

        it('should deploy and configure the uniswap v2 router mock contract', async () => {
            expect(await migration.name()).to.eq(ContractInstance.MockUniswapV2Router02);
        });
    },
    () => isMainnet()
);
