import { ContractName, DeployedContracts, isMainnet, toDeployTag } from '../../utils/Deploy';
import { TokenData, TokenSymbol } from '../../utils/TokenData';
import { toWei } from '../../utils/Types';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment('1642682517-create-test-tokens', toDeployTag(__filename), async () => {
    let deployer: string;

    const INITIAL_SUPPLY = toWei(1_000_000_000);

    before(async () => {
        ({ deployer } = await getNamedAccounts());
    });

    if (!isMainnet()) {
        it('should deploy all test tokens', async () => {
            for (const { symbol, contractName } of [
                { symbol: TokenSymbol.TKN1, contractName: ContractName.TestToken1 },
                { symbol: TokenSymbol.TKN2, contractName: ContractName.TestToken2 },
                { symbol: TokenSymbol.TKN3, contractName: ContractName.TestToken3 }
            ]) {
                const tokenData = new TokenData(symbol as TokenSymbol);
                const testToken = await DeployedContracts[contractName].deployed();

                expect(await testToken.name()).to.equal(tokenData.name());
                expect(await testToken.symbol()).to.equal(tokenData.symbol());
                expect(await testToken.decimals()).to.equal(tokenData.decimals());

                expect(await testToken.balanceOf(deployer)).to.equal(INITIAL_SUPPLY);
            }
        });
    }
});
