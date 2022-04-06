import { PendingWithdrawals, PoolCollection } from '../../components/Contracts';
import { NetworkSettingsV1 } from '../../components/LegacyContractsV3';
import { DeployedContracts, InstanceName, isLive } from '../../utils/Deploy';
import { duration } from '../../utils/Time';
import { TokenData, TokenSymbol } from '../../utils/TokenData';
import { toPPM, toWei } from '../../utils/Types';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment(
    __filename,
    () => {
        let networkSettings: NetworkSettingsV1;
        let poolCollection: PoolCollection;
        let pendingWithdrawals: PendingWithdrawals;

        let deployer: string;

        const INITIAL_SUPPLY = toWei(1_000_000_000);

        const DEPOSIT_LIMIT = toWei(5_000_000);
        const FUNDING_LIMIT = toWei(10_000_000);
        const TRADING_FEE = toPPM(0.2);
        const BNT_VIRTUAL_BALANCE = 1;
        const BASE_TOKEN_VIRTUAL_BALANCE = 2;

        const INITIAL_DEPOSITS = {
            [InstanceName.TestToken1]: toWei(50_000),
            [InstanceName.TestToken2]: toWei(500_000),
            [InstanceName.TestToken3]: toWei(1_000_000),
            [InstanceName.TestToken4]: toWei(2_000_000),
            [InstanceName.TestToken5]: toWei(3_000_000)
        };

        const TOKENS = [
            { symbol: TokenSymbol.TKN1, contractName: InstanceName.TestToken1 },
            { symbol: TokenSymbol.TKN2, contractName: InstanceName.TestToken2 },
            { symbol: TokenSymbol.TKN3, contractName: InstanceName.TestToken3 },
            { symbol: TokenSymbol.TKN4, contractName: InstanceName.TestToken4, tradingDisabled: true },
            { symbol: TokenSymbol.TKN5, contractName: InstanceName.TestToken5, depositingDisabled: true }
        ];

        before(async () => {
            ({ deployer } = await getNamedAccounts());
        });

        beforeEach(async () => {
            networkSettings = await DeployedContracts.NetworkSettingsV1.deployed();
            poolCollection = await DeployedContracts.PoolCollectionType1V1.deployed();
            pendingWithdrawals = await DeployedContracts.PendingWithdrawals.deployed();
        });

        it('should deploy and configure a test network', async () => {
            for (const { symbol, contractName, tradingDisabled, depositingDisabled } of TOKENS) {
                const tokenData = new TokenData(symbol as TokenSymbol);
                const testToken = await DeployedContracts[contractName].deployed();

                const initialDeposit = (INITIAL_DEPOSITS as any)[contractName] as number;

                expect(await testToken.name()).to.equal(tokenData.name());
                expect(await testToken.symbol()).to.equal(tokenData.symbol());
                expect(await testToken.decimals()).to.equal(tokenData.decimals());
                expect(await testToken.totalSupply()).to.equal(INITIAL_SUPPLY);
                expect(await testToken.balanceOf(deployer)).to.equal(INITIAL_SUPPLY.sub(initialDeposit));

                expect(await networkSettings.isTokenWhitelisted(testToken.address)).to.be.true;
                expect(await networkSettings.poolFundingLimit(testToken.address)).to.equal(FUNDING_LIMIT);

                const data = await poolCollection.poolData(testToken.address);
                expect(data.depositLimit).to.equal(DEPOSIT_LIMIT);
                expect(data.tradingFeePPM).to.equal(TRADING_FEE);
                expect(data.liquidity.stakedBalance).to.equal(initialDeposit);
                expect(data.liquidity.baseTokenTradingLiquidity).to.equal(
                    data.liquidity.bntTradingLiquidity.mul(BASE_TOKEN_VIRTUAL_BALANCE).div(BNT_VIRTUAL_BALANCE)
                );

                expect(data.tradingEnabled).to.be.equal(!tradingDisabled);
                expect(data.depositingEnabled).to.be.equal(!depositingDisabled);
            }

            expect(await pendingWithdrawals.lockDuration()).to.equal(duration.minutes(10));
        });
    },
    () => isLive()
);
