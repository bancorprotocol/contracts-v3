import Contracts, {
    BancorNetworkInfo,
    BancorPortal,
    IERC20,
    MockUniswapV2Factory,
    MockUniswapV2Pair,
    MockUniswapV2Router02,
    NetworkSettings,
    PoolToken,
    TestBancorNetwork,
    TestPoolCollection
} from '../../components/Contracts';
import { ZERO_ADDRESS } from '../../utils/Constants';
import { NATIVE_TOKEN_ADDRESS, TokenData, TokenSymbol } from '../../utils/TokenData';
import { Addressable, toWei } from '../../utils/Types';
import {
    createProxy,
    createSystem,
    createTestToken,
    createToken,
    setupFundedPool,
    TokenWithAddress
} from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { getBalances, getTransactionCost, toAddress } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, BigNumberish, ContractTransaction, utils } from 'ethers';
import { ethers } from 'hardhat';

const { formatBytes32String } = utils;

describe('BancorPortal', () => {
    interface ReserveTokenAndPoolTokenBundle {
        reserveToken: TokenWithAddress;
        poolToken?: PoolToken;
    }

    let network: TestBancorNetwork;
    let networkInfo: BancorNetworkInfo;
    let bnt: IERC20;
    let bntPoolToken: PoolToken;
    let networkSettings: NetworkSettings;
    let poolCollection: TestPoolCollection;
    let bancorPortal: BancorPortal;

    let deployer: SignerWithAddress;
    let user: SignerWithAddress;

    let uniswapV2Pair: MockUniswapV2Pair;
    let uniswapV2Router02: MockUniswapV2Router02;
    let uniswapV2Factory: MockUniswapV2Factory;
    let weth: TokenWithAddress;

    const BNT_VIRTUAL_BALANCE = 1;
    const BASE_TOKEN_VIRTUAL_BALANCE = 2;
    const FUNDING_LIMIT = toWei(10_000_000);
    const CONTEXT_ID = formatBytes32String('CTX');

    const AMOUNT = 1000;

    shouldHaveGap('BancorPortal');

    before(async () => {
        [deployer, user] = await ethers.getSigners();
    });

    beforeEach(async () => {
        ({ network, networkSettings, bnt, poolCollection, networkInfo, bntPoolToken } = await createSystem());

        weth = await createTestToken();

        uniswapV2Pair = await Contracts.MockUniswapV2Pair.deploy(100_000_000, weth.address);
        uniswapV2Factory = await Contracts.MockUniswapV2Factory.deploy(uniswapV2Pair.address);
        uniswapV2Router02 = await Contracts.MockUniswapV2Router02.deploy(uniswapV2Pair.address, weth.address);

        bancorPortal = await createProxy(Contracts.BancorPortal, {
            ctorArgs: [
                network.address,
                networkSettings.address,
                bnt.address,
                uniswapV2Router02.address,
                uniswapV2Factory.address,
                uniswapV2Router02.address,
                uniswapV2Factory.address
            ]
        });

        await uniswapV2Pair.transfer(user.address, 1_000_000);
    });

    describe('construction', () => {
        it('should revert when initializing with an invalid network contract', async () => {
            await expect(
                Contracts.BancorPortal.deploy(
                    ZERO_ADDRESS,
                    networkSettings.address,
                    bnt.address,
                    uniswapV2Router02.address,
                    uniswapV2Factory.address,
                    uniswapV2Router02.address,
                    uniswapV2Factory.address
                )
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when initializing with an invalid networkSettings contract', async () => {
            await expect(
                Contracts.BancorPortal.deploy(
                    network.address,
                    ZERO_ADDRESS,
                    bnt.address,
                    uniswapV2Router02.address,
                    uniswapV2Factory.address,
                    uniswapV2Router02.address,
                    uniswapV2Factory.address
                )
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when initializing with an invalid bnt contract', async () => {
            await expect(
                Contracts.BancorPortal.deploy(
                    network.address,
                    networkSettings.address,
                    ZERO_ADDRESS,
                    uniswapV2Router02.address,
                    uniswapV2Factory.address,
                    uniswapV2Router02.address,
                    uniswapV2Factory.address
                )
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when initializing with an invalid uniswapV2Router contract', async () => {
            await expect(
                Contracts.BancorPortal.deploy(
                    network.address,
                    networkSettings.address,
                    bnt.address,
                    ZERO_ADDRESS,
                    uniswapV2Factory.address,
                    uniswapV2Router02.address,
                    uniswapV2Factory.address
                )
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when initializing with an invalid sushiSwapV2Router contract', async () => {
            await expect(
                Contracts.BancorPortal.deploy(
                    network.address,
                    networkSettings.address,
                    bnt.address,
                    uniswapV2Router02.address,
                    ZERO_ADDRESS,
                    uniswapV2Router02.address,
                    uniswapV2Factory.address
                )
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when initializing with an invalid sushiSwapV2Factory contract', async () => {
            await expect(
                Contracts.BancorPortal.deploy(
                    network.address,
                    networkSettings.address,
                    bnt.address,
                    uniswapV2Router02.address,
                    uniswapV2Factory.address,
                    ZERO_ADDRESS,
                    uniswapV2Factory.address
                )
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when initializing with an invalid network contract', async () => {
            await expect(
                Contracts.BancorPortal.deploy(
                    network.address,
                    networkSettings.address,
                    bnt.address,
                    uniswapV2Router02.address,
                    uniswapV2Factory.address,
                    uniswapV2Router02.address,
                    ZERO_ADDRESS
                )
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should be initialized', async () => {
            expect(await bancorPortal.version()).to.equal(3);
        });

        it('should revert when attempting to reinitialize', async () => {
            await expect(bancorPortal.initialize()).to.be.revertedWithError(
                'Initializable: contract is already initialized'
            );
        });
    });

    describe('general', () => {
        it("should revert when none of the pair's tokens are whitelisted", async () => {
            await uniswapV2Pair.connect(user).approve(bancorPortal.address, AMOUNT);
            const token1 = await createToken(new TokenData(TokenSymbol.TKN1));
            const token2 = await createToken(new TokenData(TokenSymbol.TKN2));
            await uniswapV2Pair.setTokens(token1.address, token2.address);
            await uniswapV2Factory.setTokens(token1.address, token2.address);

            await expect(
                bancorPortal.connect(user).migrateUniswapV2Position(token1.address, token2.address, 10)
            ).to.be.revertedWithError('UnsupportedTokens');
        });

        it('should revert if the migration is not approved', async () => {
            const token1 = await createToken(new TokenData(TokenSymbol.TKN1));
            const token2 = await createToken(new TokenData(TokenSymbol.TKN2));
            await uniswapV2Factory.setTokens(token1.address, token2.address);
            await expect(
                bancorPortal.connect(user).migrateUniswapV2Position(token1.address, token2.address, 10)
            ).to.be.revertedWithError(new TokenData(TokenSymbol.TKN).errors().exceedsAllowance);
        });

        it('should revert if the input amount is 0', async () => {
            const token1 = await createToken(new TokenData(TokenSymbol.TKN1));
            const token2 = await createToken(new TokenData(TokenSymbol.TKN2));
            await uniswapV2Factory.setTokens(token1.address, token2.address);
            await expect(
                bancorPortal.connect(user).migrateUniswapV2Position(token1.address, token2.address, 0)
            ).to.be.revertedWithError('ZeroValue');
        });

        it('should revert if there is no Uniswap pair for specified tokens', async () => {
            await uniswapV2Pair.connect(user).approve(bancorPortal.address, AMOUNT);
            const token1 = await createToken(new TokenData(TokenSymbol.TKN1));
            const token2 = await createToken(new TokenData(TokenSymbol.TKN2));
            await uniswapV2Pair.setTokens(token1.address, token2.address);
            await expect(
                bancorPortal.connect(user).migrateUniswapV2Position(token1.address, token2.address, 10)
            ).to.be.revertedWithError('NoPairForTokens');
        });

        it('should return the correct values', async () => {
            await uniswapV2Pair.connect(user).approve(bancorPortal.address, AMOUNT);
            const { poolToken: poolToken1, token: whitelistedToken1 } = await preparePoolAndToken(TokenSymbol.TKN1);
            const { poolToken: poolToken2, token: whitelistedToken2 } = await preparePoolAndToken(TokenSymbol.TKN2);
            await uniswapV2Pair.setTokens(whitelistedToken1.address, whitelistedToken2.address);
            await uniswapV2Factory.setTokens(whitelistedToken1.address, whitelistedToken2.address);
            const res = await testMigrationDeposit([
                { reserveToken: whitelistedToken1, poolToken: poolToken1 },
                { reserveToken: whitelistedToken2, poolToken: poolToken2 }
            ]);
            await expect(res)
                .to.emit(bancorPortal, 'UniswapV2PositionMigrated')
                .withArgs(
                    user.address,
                    uniswapV2Pair.address,
                    whitelistedToken1.address,
                    whitelistedToken2.address,
                    AMOUNT,
                    AMOUNT,
                    true,
                    true
                );
        });
    });

    describe('transfers', () => {
        beforeEach(async () => {
            await uniswapV2Pair.connect(user).approve(bancorPortal.address, AMOUNT);
        });

        it("should transfer funds to the user's wallet when only token1 is whitelisted", async () => {
            const { token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.TKN1);
            const notWhitelistedToken = await createToken(new TokenData(TokenSymbol.TKN2));
            await uniswapV2Pair.setTokens(whitelistedToken.address, notWhitelistedToken.address);
            await uniswapV2Factory.setTokens(whitelistedToken.address, notWhitelistedToken.address);
            await testMigrationTransfer(whitelistedToken, notWhitelistedToken);
        });

        it("should transfer funds to the user's wallet when only token2 is whitelisted", async () => {
            const { token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.TKN1);
            const notWhitelistedToken = await createToken(new TokenData(TokenSymbol.TKN2));
            await uniswapV2Pair.setTokens(notWhitelistedToken.address, whitelistedToken.address);
            await uniswapV2Factory.setTokens(notWhitelistedToken.address, whitelistedToken.address);
            await testMigrationTransfer(notWhitelistedToken, whitelistedToken);
        });

        it("should transfer funds to the user's wallet when token1 is the native token and token2 is whitelisted", async () => {
            const { token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.TKN1);
            const notWhitelistedToken = await createToken(new TokenData(TokenSymbol.ETH));
            await uniswapV2Pair.setTokens(weth.address, whitelistedToken.address);
            await uniswapV2Factory.setTokens(weth.address, whitelistedToken.address);
            await testMigrationTransfer(notWhitelistedToken, whitelistedToken);
        });

        it("should transfer funds to the user's wallet when token1 is whitelisted and token2 is the native token", async () => {
            const { token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.TKN1);
            const notWhitelistedToken = await createToken(new TokenData(TokenSymbol.ETH));
            await uniswapV2Pair.setTokens(whitelistedToken.address, weth.address);
            await uniswapV2Factory.setTokens(whitelistedToken.address, weth.address);
            await testMigrationTransfer(whitelistedToken, notWhitelistedToken);
        });
    });

    describe('deposits', () => {
        beforeEach(async () => {
            await uniswapV2Pair.connect(user).approve(bancorPortal.address, AMOUNT);
        });

        it('should deposit when only token1 is whitelisted', async () => {
            const { poolToken, token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.TKN1);
            const notWhitelistedToken = await createToken(new TokenData(TokenSymbol.TKN2));
            await uniswapV2Factory.setTokens(whitelistedToken.address, notWhitelistedToken.address);
            await uniswapV2Pair.setTokens(whitelistedToken.address, notWhitelistedToken.address);
            const res = await testMigrationDeposit([
                { reserveToken: whitelistedToken, poolToken },
                { reserveToken: notWhitelistedToken }
            ]);
            await expect(res)
                .to.emit(bancorPortal, 'UniswapV2PositionMigrated')
                .withArgs(
                    user.address,
                    uniswapV2Pair.address,
                    whitelistedToken.address,
                    notWhitelistedToken.address,
                    AMOUNT,
                    0,
                    true,
                    false
                );
        });

        it('should deposit when only token2 is whitelisted', async () => {
            const { poolToken, token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.TKN1);
            const notWhitelistedToken = await createToken(new TokenData(TokenSymbol.TKN2));
            await uniswapV2Pair.setTokens(notWhitelistedToken.address, whitelistedToken.address);
            await uniswapV2Factory.setTokens(notWhitelistedToken.address, whitelistedToken.address);
            const res = await testMigrationDeposit([
                { reserveToken: notWhitelistedToken },
                { reserveToken: whitelistedToken, poolToken }
            ]);
            await expect(res)
                .to.emit(bancorPortal, 'UniswapV2PositionMigrated')
                .withArgs(
                    user.address,
                    uniswapV2Pair.address,
                    notWhitelistedToken.address,
                    whitelistedToken.address,
                    0,
                    AMOUNT,
                    false,
                    true
                );
        });

        it('should deposit both tokens when possible', async () => {
            const { poolToken: poolToken1, token: token1 } = await preparePoolAndToken(TokenSymbol.TKN1);
            const { poolToken: poolToken2, token: token2 } = await preparePoolAndToken(TokenSymbol.TKN2);
            await uniswapV2Pair.setTokens(token1.address, token2.address);
            await uniswapV2Factory.setTokens(token1.address, token2.address);
            const res = await testMigrationDeposit([
                { reserveToken: token1, poolToken: poolToken1 },
                { reserveToken: token2, poolToken: poolToken2 }
            ]);
            await expect(res)
                .to.emit(bancorPortal, 'UniswapV2PositionMigrated')
                .withArgs(
                    user.address,
                    uniswapV2Pair.address,
                    token1.address,
                    token2.address,
                    AMOUNT,
                    AMOUNT,
                    true,
                    true
                );
        });

        it('should deposit when token1 is the native token and token2 is not whitelisted', async () => {
            const { poolToken, token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.ETH);
            const notWhitelistedToken = await createToken(new TokenData(TokenSymbol.TKN2));
            await uniswapV2Pair.setTokens(weth.address, notWhitelistedToken.address);
            await uniswapV2Factory.setTokens(weth.address, notWhitelistedToken.address);
            const res = await testMigrationDeposit([
                { reserveToken: whitelistedToken, poolToken },
                { reserveToken: notWhitelistedToken }
            ]);
            await expect(res)
                .to.emit(bancorPortal, 'UniswapV2PositionMigrated')
                .withArgs(
                    user.address,
                    uniswapV2Pair.address,
                    whitelistedToken.address,
                    notWhitelistedToken.address,
                    AMOUNT,
                    0,
                    true,
                    false
                );
        });

        it('should deposit when token1 is the native token and token2 is whitelisted', async () => {
            const { poolToken: poolToken1, token: whitelistedToken1 } = await preparePoolAndToken(TokenSymbol.ETH);
            const { poolToken: poolToken2, token: whitelistedToken2 } = await preparePoolAndToken(TokenSymbol.TKN1);
            await uniswapV2Pair.setTokens(weth.address, whitelistedToken2.address);
            await uniswapV2Factory.setTokens(weth.address, whitelistedToken2.address);
            const res = await testMigrationDeposit([
                { reserveToken: whitelistedToken1, poolToken: poolToken1 },
                { reserveToken: whitelistedToken2, poolToken: poolToken2 }
            ]);
            await expect(res)
                .to.emit(bancorPortal, 'UniswapV2PositionMigrated')
                .withArgs(
                    user.address,
                    uniswapV2Pair.address,
                    whitelistedToken1.address,
                    whitelistedToken2.address,
                    AMOUNT,
                    AMOUNT,
                    true,
                    true
                );
        });

        it('should deposit when token1 is WETH and token2 is whitelisted', async () => {
            const { poolToken: poolToken1, token: whitelistedToken1 } = await preparePoolAndToken(TokenSymbol.ETH);
            const { poolToken: poolToken2, token: whitelistedToken2 } = await preparePoolAndToken(TokenSymbol.TKN1);
            await uniswapV2Pair.setTokens(weth.address, whitelistedToken2.address);
            await uniswapV2Factory.setTokens(weth.address, whitelistedToken2.address);
            const res = await testMigrationDeposit([
                { reserveToken: weth, poolToken: poolToken1 },
                { reserveToken: whitelistedToken2, poolToken: poolToken2 }
            ]);
            await expect(res)
                .to.emit(bancorPortal, 'UniswapV2PositionMigrated')
                .withArgs(
                    user.address,
                    uniswapV2Pair.address,
                    whitelistedToken1.address,
                    whitelistedToken2.address,
                    AMOUNT,
                    AMOUNT,
                    true,
                    true
                );
        });

        it('should deposit when token1 is WETH and token2 is not whitelisted', async () => {
            const { poolToken, token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.ETH);
            const notWhitelistedToken = await createToken(new TokenData(TokenSymbol.TKN2));
            await uniswapV2Pair.setTokens(weth.address, notWhitelistedToken.address);
            await uniswapV2Factory.setTokens(weth.address, notWhitelistedToken.address);
            const res = await testMigrationDeposit([
                { reserveToken: weth, poolToken },
                { reserveToken: notWhitelistedToken }
            ]);
            await expect(res)
                .to.emit(bancorPortal, 'UniswapV2PositionMigrated')
                .withArgs(
                    user.address,
                    uniswapV2Pair.address,
                    whitelistedToken.address,
                    notWhitelistedToken.address,
                    AMOUNT,
                    0,
                    true,
                    false
                );
        });

        it('should deposit when token1 is not whitelisted and token2 is the native token', async () => {
            const { poolToken, token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.ETH);
            const notWhitelistedToken = await createToken(new TokenData(TokenSymbol.TKN2));
            await uniswapV2Pair.setTokens(notWhitelistedToken.address, weth.address);
            await uniswapV2Factory.setTokens(notWhitelistedToken.address, weth.address);
            const res = await testMigrationDeposit([
                { reserveToken: notWhitelistedToken },
                { reserveToken: weth, poolToken }
            ]);
            await expect(res)
                .to.emit(bancorPortal, 'UniswapV2PositionMigrated')
                .withArgs(
                    user.address,
                    uniswapV2Pair.address,
                    notWhitelistedToken.address,
                    whitelistedToken.address,
                    0,
                    AMOUNT,
                    false,
                    true
                );
        });

        it('should deposit when token1 is whitelisted and token2 is the native token', async () => {
            const { poolToken: poolToken1, token: whitelistedToken1 } = await preparePoolAndToken(TokenSymbol.TKN1);
            const { poolToken: poolToken2, token: whitelistedToken2 } = await preparePoolAndToken(TokenSymbol.ETH);
            await uniswapV2Pair.setTokens(whitelistedToken1.address, weth.address);
            await uniswapV2Factory.setTokens(whitelistedToken1.address, weth.address);
            const res = await testMigrationDeposit([
                { reserveToken: whitelistedToken1, poolToken: poolToken1 },
                { reserveToken: weth, poolToken: poolToken2 }
            ]);
            await expect(res)
                .to.emit(bancorPortal, 'UniswapV2PositionMigrated')
                .withArgs(
                    user.address,
                    uniswapV2Pair.address,
                    whitelistedToken1.address,
                    whitelistedToken2.address,
                    AMOUNT,
                    AMOUNT,
                    true,
                    true
                );
        });

        it('should deposit when token1 is not whitelisted and token2 is the native token', async () => {
            const { poolToken, token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.ETH);
            const notWhitelistedToken = await createToken(new TokenData(TokenSymbol.TKN2));
            await uniswapV2Pair.setTokens(notWhitelistedToken.address, weth.address);
            await uniswapV2Factory.setTokens(notWhitelistedToken.address, weth.address);
            const res = await testMigrationDeposit([
                { reserveToken: notWhitelistedToken },
                { reserveToken: whitelistedToken, poolToken }
            ]);
            await expect(res)
                .to.emit(bancorPortal, 'UniswapV2PositionMigrated')
                .withArgs(
                    user.address,
                    uniswapV2Pair.address,
                    notWhitelistedToken.address,
                    whitelistedToken.address,
                    0,
                    AMOUNT,
                    false,
                    true
                );
        });

        it('should deposit when token1 is whitelisted and token2 is the native token', async () => {
            const { poolToken: poolToken1, token: whitelistedToken1 } = await preparePoolAndToken(TokenSymbol.TKN1);
            const { poolToken: poolToken2, token: whitelistedToken2 } = await preparePoolAndToken(TokenSymbol.ETH);
            await uniswapV2Pair.setTokens(whitelistedToken1.address, weth.address);
            await uniswapV2Factory.setTokens(whitelistedToken1.address, weth.address);
            const res = await testMigrationDeposit([
                { reserveToken: whitelistedToken1, poolToken: poolToken1 },
                { reserveToken: whitelistedToken2, poolToken: poolToken2 }
            ]);
            await expect(res)
                .to.emit(bancorPortal, 'UniswapV2PositionMigrated')
                .withArgs(
                    user.address,
                    uniswapV2Pair.address,
                    whitelistedToken1.address,
                    whitelistedToken2.address,
                    AMOUNT,
                    AMOUNT,
                    true,
                    true
                );
        });

        it('should deposit when token1 is bnt and token2 is not whitelisted', async () => {
            const { token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.TKN1);
            await networkSettings.setFundingLimit(whitelistedToken.address, FUNDING_LIMIT);
            await poolCollection.requestFundingT(CONTEXT_ID, whitelistedToken.address, AMOUNT);
            const notWhitelistedToken = await createToken(new TokenData(TokenSymbol.TKN2));
            await uniswapV2Pair.setTokens(bnt.address, notWhitelistedToken.address);
            await uniswapV2Factory.setTokens(bnt.address, notWhitelistedToken.address);
            const res = await testMigrationDeposit([
                { reserveToken: bnt, poolToken: bntPoolToken },
                { reserveToken: notWhitelistedToken }
            ]);
            await expect(res)
                .to.emit(bancorPortal, 'UniswapV2PositionMigrated')
                .withArgs(
                    user.address,
                    uniswapV2Pair.address,
                    bnt.address,
                    notWhitelistedToken.address,
                    AMOUNT,
                    0,
                    true,
                    false
                );
        });

        it('should deposit when token1 is not whitelisted and token2 is bnt', async () => {
            const { token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.TKN1);
            await networkSettings.setFundingLimit(whitelistedToken.address, FUNDING_LIMIT);
            await poolCollection.requestFundingT(CONTEXT_ID, whitelistedToken.address, AMOUNT);
            const notWhitelistedToken = await createToken(new TokenData(TokenSymbol.TKN2));
            await uniswapV2Pair.setTokens(notWhitelistedToken.address, bnt.address);
            await uniswapV2Factory.setTokens(notWhitelistedToken.address, bnt.address);
            const res = await testMigrationDeposit([
                { reserveToken: notWhitelistedToken },
                { reserveToken: bnt, poolToken: bntPoolToken }
            ]);
            await expect(res)
                .to.emit(bancorPortal, 'UniswapV2PositionMigrated')
                .withArgs(
                    user.address,
                    uniswapV2Pair.address,
                    notWhitelistedToken.address,
                    bnt.address,
                    0,
                    AMOUNT,
                    false,
                    true
                );
        });

        it('should deposit when token1 is bnt and token2 is whitelisted', async () => {
            const { poolToken, token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.TKN1);
            await networkSettings.setFundingLimit(whitelistedToken.address, FUNDING_LIMIT);
            await poolCollection.requestFundingT(CONTEXT_ID, whitelistedToken.address, AMOUNT);
            await uniswapV2Pair.setTokens(bnt.address, whitelistedToken.address);
            await uniswapV2Factory.setTokens(bnt.address, whitelistedToken.address);
            const res = await testMigrationDeposit([
                { reserveToken: bnt, poolToken: bntPoolToken },
                { reserveToken: whitelistedToken, poolToken }
            ]);
            await expect(res)
                .to.emit(bancorPortal, 'UniswapV2PositionMigrated')
                .withArgs(
                    user.address,
                    uniswapV2Pair.address,
                    bnt.address,
                    whitelistedToken.address,
                    AMOUNT,
                    AMOUNT,
                    true,
                    true
                );
        });

        it('should deposit when token1 is whitelisted and token2 is bnt', async () => {
            const { poolToken, token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.TKN1);
            await networkSettings.setFundingLimit(whitelistedToken.address, FUNDING_LIMIT);
            await poolCollection.requestFundingT(CONTEXT_ID, whitelistedToken.address, AMOUNT);
            await uniswapV2Pair.setTokens(whitelistedToken.address, bnt.address);
            await uniswapV2Factory.setTokens(whitelistedToken.address, bnt.address);
            const res = await testMigrationDeposit([
                { reserveToken: whitelistedToken, poolToken },
                { reserveToken: bnt, poolToken: bntPoolToken }
            ]);
            await expect(res)
                .to.emit(bancorPortal, 'UniswapV2PositionMigrated')
                .withArgs(
                    user.address,
                    uniswapV2Pair.address,
                    whitelistedToken.address,
                    bnt.address,
                    AMOUNT,
                    AMOUNT,
                    true,
                    true
                );
        });
    });

    // it is assumed SushiSwap is identical to Uniswap and therefore already tested
    // this block is intended to verify the existence of a SushiSwap external function, and its I/O signature
    describe('SushiSwap', () => {
        beforeEach(async () => {
            await uniswapV2Pair.connect(user).approve(bancorPortal.address, AMOUNT);
        });

        it('should emits a SushiSwap event post successful SushiSwap migration', async () => {
            const { poolToken, token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.TKN1);
            const notWhitelistedToken = await createToken(new TokenData(TokenSymbol.TKN2));
            await uniswapV2Factory.setTokens(whitelistedToken.address, notWhitelistedToken.address);
            await uniswapV2Pair.setTokens(whitelistedToken.address, notWhitelistedToken.address);
            const res = await testMigrationDeposit(
                [{ reserveToken: whitelistedToken, poolToken }, { reserveToken: notWhitelistedToken }],
                true
            );
            await expect(res)
                .to.emit(bancorPortal, 'SushiSwapPositionMigrated')
                .withArgs(
                    user.address,
                    uniswapV2Pair.address,
                    whitelistedToken.address,
                    notWhitelistedToken.address,
                    AMOUNT,
                    0,
                    true,
                    false
                );
        });
    });

    const testMigrationTransfer = async (token1: TokenWithAddress, token2: TokenWithAddress) => {
        // prepare Uniswap mocks
        await transfer(deployer, token1, uniswapV2Pair.address, AMOUNT);
        await transfer(deployer, token2, uniswapV2Pair.address, AMOUNT);

        // save state
        const previousBalances = await getBalances([token1, token2], user);

        // execute
        const res = await bancorPortal.connect(user).migrateUniswapV2Position(token1.address, token2.address, AMOUNT);

        // assert
        const newBalances = await getBalances([token1, token2], user);
        const whitelist = await getWhitelist(token1, token2);
        if (whitelist[token1.address] && whitelist[token2.address]) {
            expect(newBalances[token1.address].eq(previousBalances[token1.address].add(AMOUNT))).to.be.true;
            expect(newBalances[token2.address].eq(previousBalances[token2.address].add(AMOUNT))).to.be.true;
        } else {
            if (whitelist[token1.address]) {
                const transactionCost = isNativeToken(token2) ? await getTransactionCost(res) : 0;
                expect(newBalances[token1.address].eq(previousBalances[token1.address])).to.be.true;
                expect(
                    newBalances[token2.address].eq(previousBalances[token2.address].add(AMOUNT).sub(transactionCost))
                ).to.be.true;
            } else {
                const transactionCost = isNativeToken(token1) ? await getTransactionCost(res) : 0;
                expect(
                    newBalances[token1.address].eq(previousBalances[token1.address].add(AMOUNT).sub(transactionCost))
                ).to.be.true;
                expect(newBalances[token2.address].eq(previousBalances[token2.address])).to.be.true;
            }
        }
    };

    const testMigrationDeposit = async (
        bundles: ReserveTokenAndPoolTokenBundle[],
        sushiSwap = false
    ): Promise<ContractTransaction> => {
        // fund Uniswap mock
        await transfer(deployer, bundles[0].reserveToken, uniswapV2Pair.address, AMOUNT);
        await transfer(deployer, bundles[1].reserveToken, uniswapV2Pair.address, AMOUNT);

        // save state
        const previousStakedBalances = await getStakedBalances(bundles[0].reserveToken, bundles[1].reserveToken);
        const previousPoolTokenBalances = await getPoolTokenBalances(bundles[0].poolToken, bundles[1].poolToken);
        const whitelist = await getWhitelist(bundles[0].reserveToken, bundles[1].reserveToken);

        // execute
        const migrationFunction = sushiSwap
            ? bancorPortal.connect(user).migrateSushiSwapPosition
            : bancorPortal.connect(user).migrateUniswapV2Position;
        const res = await migrationFunction(bundles[0].reserveToken.address, bundles[1].reserveToken.address, AMOUNT);
        const newStakedBalances = await getStakedBalances(bundles[0].reserveToken, bundles[1].reserveToken);
        const newPoolTokenBalances = await getPoolTokenBalances(bundles[0].poolToken, bundles[1].poolToken);

        // assert staked balances
        for (const t of bundles.map((b) => b.reserveToken)) {
            if (isBNT(t)) {
                continue;
            }

            if (whitelist[t.address]) {
                expect(newStakedBalances[t.address]).to.equal(previousStakedBalances[t.address].add(AMOUNT));
            } else {
                expect(newStakedBalances[t.address]).to.equal(previousStakedBalances[t.address]);
            }
        }

        // assert poolToken balances
        for (const bundle of bundles) {
            if (bundle.poolToken && whitelist[bundle.reserveToken.address]) {
                expect(newPoolTokenBalances[bundle.poolToken.address]).to.equal(
                    previousPoolTokenBalances[bundle.poolToken.address].add(AMOUNT)
                );
            }
        }

        return res;
    };

    const getPoolTokenBalances = async (
        poolToken1?: PoolToken,
        poolToken2?: PoolToken
    ): Promise<Record<string, BigNumber>> => {
        const balances: Record<string, BigNumber> = {};
        for (const t of [poolToken1, poolToken2]) {
            if (t) {
                balances[t.address] = await t.balanceOf(user.address);
            }
        }
        return balances;
    };

    const getStakedBalances = async (
        token1: TokenWithAddress,
        token2: TokenWithAddress
    ): Promise<Record<string, BigNumber>> => {
        const balances: { [address: string]: BigNumber } = {};
        for (const t of [token1, token2]) {
            if (isBNT(t)) {
                continue;
            }

            balances[t.address] = (await poolCollection.poolData(t.address)).liquidity[2];
        }
        return balances;
    };

    const getWhitelist = async (
        token1: TokenWithAddress,
        token2: TokenWithAddress
    ): Promise<Record<string, boolean>> => {
        return {
            [token1.address]: isBNT(token1) || (await networkSettings.isTokenWhitelisted(token1.address)),
            [token2.address]: isBNT(token2) || (await networkSettings.isTokenWhitelisted(token2.address))
        };
    };

    const preparePoolAndToken = async (symbol: TokenSymbol) => {
        const balance = toWei(100_000_000);
        const { poolToken, token } = await setupFundedPool(
            {
                tokenData: new TokenData(symbol),
                balance,
                requestedFunding: balance.mul(1000),
                bntVirtualBalance: BNT_VIRTUAL_BALANCE,
                baseTokenVirtualBalance: BASE_TOKEN_VIRTUAL_BALANCE
            },
            deployer as any as SignerWithAddress,
            network,
            networkInfo,
            networkSettings,
            poolCollection
        );

        return { poolToken, token };
    };

    const isNativeToken = (token: TokenWithAddress): boolean => {
        return token.address === NATIVE_TOKEN_ADDRESS;
    };

    const isBNT = (token: TokenWithAddress): boolean => {
        return token.address === bnt.address;
    };

    const transfer = async (
        sourceAccount: SignerWithAddress,
        token: TokenWithAddress,
        target: string | Addressable,
        amount: BigNumberish
    ) => {
        const targetAddress = toAddress(target);
        const tokenAddress = token.address;
        if ([NATIVE_TOKEN_ADDRESS, weth.address].includes(tokenAddress)) {
            return sourceAccount.sendTransaction({ to: targetAddress, value: amount });
        }

        return (await Contracts.TestERC20Token.attach(tokenAddress))
            .connect(sourceAccount)
            .transfer(targetAddress, amount);
    };
});
