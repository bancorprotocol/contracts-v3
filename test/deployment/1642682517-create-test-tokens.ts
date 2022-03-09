import { TestERC20Token } from '../../components/Contracts';
import { ContractName, DeployedContracts, isMainnet, toDeployTag } from '../../utils/Deploy';
import { TokenData, TokenSymbol } from '../../utils/TokenData';
import { toWei } from '../../utils/Types';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment('1642682517-create-test-tokens', toDeployTag(__filename), async () => {
    let deployer: string;
    let testTokens: Record<string, TestERC20Token>;

    const INITIAL_SUPPLY = toWei(1_000_000_000);

    before(async () => {
        ({ deployer } = await getNamedAccounts());
    });

    beforeEach(async () => {
        testTokens = {};

        for (const { symbol, contractName } of [
            { symbol: TokenSymbol.TKN1, contractName: ContractName.TestToken1 },
            { symbol: TokenSymbol.TKN2, contractName: ContractName.TestToken2 },
            { symbol: TokenSymbol.TKN3, contractName: ContractName.TestToken3 }
        ]) {
            testTokens[symbol] = await DeployedContracts[contractName].deployed();
        }
    });

    if (!isMainnet()) {
        it('should deploy all test tokens', async () => {
            for (const [symbol, testToken] of Object.entries(testTokens)) {
                const tokenData = new TokenData(symbol as TokenSymbol);

                expect(await testToken.name()).to.equal(tokenData.name());
                expect(await testToken.symbol()).to.equal(tokenData.symbol());
                expect(await testToken.decimals()).to.equal(tokenData.decimals());

                expect(await testToken.balanceOf(deployer)).to.equal(INITIAL_SUPPLY);
            }
        });
    }
});
