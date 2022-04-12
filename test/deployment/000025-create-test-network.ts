import { PendingWithdrawals, PoolCollection } from '../../components/Contracts';
import { NetworkSettingsV1 } from '../../components/LegacyContractsV3';
import { MAX_UINT256 } from '../../utils/Constants';
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

        const TRADING_FEE = toPPM(0.2);
        const BNT_VIRTUAL_BALANCE = 1;
        const BASE_TOKEN_VIRTUAL_BALANCE = 2;

        const TOKENS = [
            {
                symbol: TokenSymbol.TKN1,
                initialSupply: toWei(1_000_000_000),
                instanceName: InstanceName.TestToken1,
                initialDeposit: toWei(50_000),
                depositLimit: toWei(5_000_000),
                fundingLimit: toWei(10_000_000)
            },
            {
                symbol: TokenSymbol.TKN2,
                initialSupply: toWei(1_000_000_000),
                instanceName: InstanceName.TestToken2,
                initialDeposit: toWei(500_000),
                depositLimit: toWei(5_000_000),
                fundingLimit: toWei(10_000_000)
            },
            {
                symbol: TokenSymbol.TKN3,
                initialSupply: toWei(1_000_000_000),
                instanceName: InstanceName.TestToken3,
                initialDeposit: toWei(1_000_000),
                depositLimit: toWei(5_000_000),
                fundingLimit: toWei(10_000_000)
            },
            {
                symbol: TokenSymbol.TKN4,
                initialSupply: toWei(1_000_000_000),
                instanceName: InstanceName.TestToken4,
                initialDeposit: toWei(2_000_000),
                depositLimit: toWei(5_000_000),
                fundingLimit: toWei(10_000_000),
                tradingDisabled: true
            },
            {
                symbol: TokenSymbol.TKN5,
                initialSupply: toWei(1_000_000_000),
                instanceName: InstanceName.TestToken5,
                initialDeposit: toWei(3_000_000),
                depositLimit: toWei(5_000_000),
                fundingLimit: toWei(10_000_000),
                depositingDisabled: true
            },
            {
                symbol: TokenSymbol.TKN6,
                initialSupply: toWei(1_000_000_000),
                instanceName: InstanceName.TestToken6,
                initialDeposit: toWei(100_000, new TokenData(TokenSymbol.TKN6).decimals()),
                depositLimit: toWei(5_000_000),
                fundingLimit: toWei(10_000_000)
            },
            {
                symbol: TokenSymbol.TKN7,
                initialSupply: toWei(1_000_000_000),
                instanceName: InstanceName.TestToken7,
                initialDeposit: toWei(100_000, new TokenData(TokenSymbol.TKN6).decimals()),
                depositLimit: MAX_UINT256,
                fundingLimit: MAX_UINT256
            }
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
            for (const {
                symbol,
                initialSupply,
                instanceName,
                initialDeposit,
                depositLimit,
                fundingLimit,
                tradingDisabled,
                depositingDisabled
            } of TOKENS) {
                const tokenData = new TokenData(symbol as TokenSymbol);
                const testToken = await DeployedContracts[instanceName].deployed();

                expect(await testToken.name()).to.equal(tokenData.name());
                expect(await testToken.symbol()).to.equal(tokenData.symbol());
                expect(await testToken.decimals()).to.equal(tokenData.decimals());
                expect(await testToken.totalSupply()).to.equal(initialSupply);
                expect(await testToken.balanceOf(deployer)).to.equal(initialSupply.sub(initialDeposit));

                expect(await networkSettings.isTokenWhitelisted(testToken.address)).to.be.true;
                expect(await networkSettings.poolFundingLimit(testToken.address)).to.equal(fundingLimit);

                const data = await poolCollection.poolData(testToken.address);
                expect(data.depositLimit).to.equal(depositLimit);
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
