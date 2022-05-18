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
import { toWei } from '../../utils/Types';
import { createProxy, createSystem, createToken, setupFundedPool, TokenWithAddress } from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { getBalances, getTransactionCost, transfer } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, ContractTransaction, utils } from 'ethers';
import { ethers } from 'hardhat';

const { formatBytes32String } = utils;
const FUNDING_LIMIT = toWei(10_000_000);
const CONTEXT_ID = formatBytes32String('CTX');

interface Whitelist {
    [address: string]: boolean;
}

interface AddressValueDictionary {
    [address: string]: BigNumber;
}

interface ReserveTokenAndPoolTokenBundle {
    reserveToken: TokenWithAddress;
    poolToken?: PoolToken;
}

describe('BancorPortal', () => {
    let network: TestBancorNetwork;
    let networkInfo: BancorNetworkInfo;
    let bnt: IERC20;
    let bntPoolToken: PoolToken;
    let networkSettings: NetworkSettings;
    let poolCollection: TestPoolCollection;
    let bancorPortal: BancorPortal;
    let uniswapV2Pair: MockUniswapV2Pair;
    let uniswapV2Router02: MockUniswapV2Router02;
    let uniswapV2Factory: MockUniswapV2Factory;
    let deployer: SignerWithAddress;
    let user: SignerWithAddress;

    const AMOUNT = BigNumber.from(1000);
    const ZERO = BigNumber.from(0);
    const BNT_VIRTUAL_BALANCE = 1;
    const BASE_TOKEN_VIRTUAL_BALANCE = 2;

    shouldHaveGap('BancorPortal');

    before(async () => {
        [deployer, user] = await ethers.getSigners();
    });

    beforeEach(async () => {
        ({ network, networkSettings, bnt, poolCollection, networkInfo, bntPoolToken } = await createSystem());
        uniswapV2Pair = await Contracts.MockUniswapV2Pair.deploy('UniswapV2Pair', 'UniswapV2Pair', 100_000_000);
        uniswapV2Router02 = await Contracts.MockUniswapV2Router02.deploy(
            'UniswapV2Router02',
            'UniswapV2Router02',
            100_000_000,
            uniswapV2Pair.address
        );

        uniswapV2Factory = await Contracts.MockUniswapV2Factory.deploy(
            'UniswapV2Factory',
            'UniswapV2Factory',
            100_000_000,
            uniswapV2Pair.address
        );
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

        await uniswapV2Pair.transfer(user.address, BigNumber.from(1_000_000));
    });

    describe('general', () => {
        it("reverts when none of the pair's tokens are whitelisted", async () => {
            await uniswapV2Pair.connect(user).approve(bancorPortal.address, AMOUNT);
            const token1 = await createToken(new TokenData(TokenSymbol.TKN1));
            const token2 = await createToken(new TokenData(TokenSymbol.TKN2));
            await uniswapV2Pair.setTokens(token1.address, token2.address);
            await uniswapV2Factory.setTokens(token1.address, token2.address);

            await expect(
                bancorPortal.connect(user).migrateUniswapV2Position(token1.address, token2.address, 10)
            ).to.be.revertedWith('UnsupportedTokens');
        });

        it('reverts if the migration is not approved', async () => {
            const token1 = await createToken(new TokenData(TokenSymbol.TKN1));
            const token2 = await createToken(new TokenData(TokenSymbol.TKN2));
            await uniswapV2Factory.setTokens(token1.address, token2.address);
            await expect(
                bancorPortal.connect(user).migrateUniswapV2Position(token1.address, token2.address, 10)
            ).to.be.revertedWith(new TokenData(TokenSymbol.TKN).errors().exceedsAllowance);
        });

        it('reverts if the input amount is 0', async () => {
            const token1 = await createToken(new TokenData(TokenSymbol.TKN1));
            const token2 = await createToken(new TokenData(TokenSymbol.TKN2));
            await uniswapV2Factory.setTokens(token1.address, token2.address);
            await expect(
                bancorPortal.connect(user).migrateUniswapV2Position(token1.address, token2.address, 0)
            ).to.be.revertedWith('ZeroValue()');
        });

        it('reverts if there is no Uniswap pair for specified tokens', async () => {
            await uniswapV2Pair.connect(user).approve(bancorPortal.address, AMOUNT);
            const token1 = await createToken(new TokenData(TokenSymbol.TKN1));
            const token2 = await createToken(new TokenData(TokenSymbol.TKN2));
            await uniswapV2Pair.setTokens(token1.address, token2.address);
            await expect(
                bancorPortal.connect(user).migrateUniswapV2Position(token1.address, token2.address, 10)
            ).to.be.revertedWith('NoPairForTokens()');
        });

        it('returns the correct values', async () => {
            await uniswapV2Pair.connect(user).approve(bancorPortal.address, AMOUNT);
            const { poolToken: poolToken1, token: whitelistedToken1 } = await preparePoolAndToken(TokenSymbol.ETH);
            const { poolToken: poolToken2, token: whitelistedToken2 } = await preparePoolAndToken(TokenSymbol.TKN1);
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

    describe('construction', () => {
        it('reverts when initializing with an invalid network contract', async () => {
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
            ).to.be.revertedWith('InvalidAddress');
        });

        it('reverts when initializing with an invalid networkSettings contract', async () => {
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
            ).to.be.revertedWith('InvalidAddress');
        });

        it('reverts when initializing with an invalid bnt contract', async () => {
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
            ).to.be.revertedWith('InvalidAddress');
        });

        it('reverts when initializing with an invalid uniswapV2Router contract', async () => {
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
            ).to.be.revertedWith('InvalidAddress');
        });

        it('reverts when initializing with an invalid sushiSwapV2Router contract', async () => {
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
            ).to.be.revertedWith('InvalidAddress');
        });

        it('reverts when initializing with an invalid sushiSwapV2Factory contract', async () => {
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
            ).to.be.revertedWith('InvalidAddress');
        });

        it('reverts when initializing with an invalid network contract', async () => {
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
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should be initialized', async () => {
            expect(await bancorPortal.version()).to.equal(1);
        });
    });

    describe('transfers', () => {
        beforeEach(async () => {
            await uniswapV2Pair.connect(user).approve(bancorPortal.address, AMOUNT);
        });

        it("transfers funds to the user's wallet when only token1 is whitelisted", async () => {
            const { token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.TKN1);
            const unlistedToken = await createToken(new TokenData(TokenSymbol.TKN2));
            await uniswapV2Pair.setTokens(whitelistedToken.address, unlistedToken.address);
            await uniswapV2Factory.setTokens(whitelistedToken.address, unlistedToken.address);
            await testMigrationTransfer(whitelistedToken, unlistedToken);
        });

        it("transfers funds to the user's wallet when only token2 is whitelisted", async () => {
            const { token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.TKN1);
            const unlistedToken = await createToken(new TokenData(TokenSymbol.TKN2));
            await uniswapV2Pair.setTokens(unlistedToken.address, whitelistedToken.address);
            await uniswapV2Factory.setTokens(unlistedToken.address, whitelistedToken.address);
            await testMigrationTransfer(unlistedToken, whitelistedToken);
        });

        it("transfers funds to the user's wallet when token1 is the native token and token2 is whitelisted", async () => {
            const { token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.TKN1);
            const unlistedToken = await createToken(new TokenData(TokenSymbol.ETH));
            await uniswapV2Pair.setTokens(unlistedToken.address, whitelistedToken.address);
            await uniswapV2Factory.setTokens(unlistedToken.address, whitelistedToken.address);
            await testMigrationTransfer(unlistedToken, whitelistedToken);
        });

        it("transfers funds to the user's wallet when token1 is whitelisted and token2 is the native token", async () => {
            const { token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.TKN1);
            const unlistedToken = await createToken(new TokenData(TokenSymbol.ETH));
            await uniswapV2Pair.setTokens(whitelistedToken.address, unlistedToken.address);
            await uniswapV2Factory.setTokens(whitelistedToken.address, unlistedToken.address);
            await testMigrationTransfer(whitelistedToken, unlistedToken);
        });
    });

    describe('deposits', () => {
        beforeEach(async () => {
            await uniswapV2Pair.connect(user).approve(bancorPortal.address, AMOUNT);
        });

        it('deposits when only token1 is whitelisted', async () => {
            const { poolToken, token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.TKN1);
            const unlistedToken = await createToken(new TokenData(TokenSymbol.TKN2));
            await uniswapV2Factory.setTokens(whitelistedToken.address, unlistedToken.address);
            await uniswapV2Pair.setTokens(whitelistedToken.address, unlistedToken.address);
            const res = await testMigrationDeposit([
                { reserveToken: whitelistedToken, poolToken },
                { reserveToken: unlistedToken }
            ]);
            await expect(res)
                .to.emit(bancorPortal, 'UniswapV2PositionMigrated')
                .withArgs(
                    user.address,
                    uniswapV2Pair.address,
                    whitelistedToken.address,
                    unlistedToken.address,
                    AMOUNT,
                    ZERO,
                    true,
                    false
                );
        });

        it('deposits when only token2 is whitelisted', async () => {
            const { poolToken, token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.TKN1);
            const unlistedToken = await createToken(new TokenData(TokenSymbol.TKN2));
            await uniswapV2Pair.setTokens(unlistedToken.address, whitelistedToken.address);
            await uniswapV2Factory.setTokens(unlistedToken.address, whitelistedToken.address);
            const res = await testMigrationDeposit([
                { reserveToken: unlistedToken },
                { reserveToken: whitelistedToken, poolToken }
            ]);
            await expect(res)
                .to.emit(bancorPortal, 'UniswapV2PositionMigrated')
                .withArgs(
                    user.address,
                    uniswapV2Pair.address,
                    unlistedToken.address,
                    whitelistedToken.address,
                    ZERO,
                    AMOUNT,
                    false,
                    true
                );
        });

        it('deposits both tokens when possible', async () => {
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

        it('deposits when token1 is the native token and token2 is unlisted', async () => {
            const { poolToken, token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.ETH);
            const unlistedToken = await createToken(new TokenData(TokenSymbol.TKN2));
            await uniswapV2Pair.setTokens(whitelistedToken.address, unlistedToken.address);
            await uniswapV2Factory.setTokens(whitelistedToken.address, unlistedToken.address);
            const res = await testMigrationDeposit([
                { reserveToken: whitelistedToken, poolToken },
                { reserveToken: unlistedToken }
            ]);
            await expect(res)
                .to.emit(bancorPortal, 'UniswapV2PositionMigrated')
                .withArgs(
                    user.address,
                    uniswapV2Pair.address,
                    whitelistedToken.address,
                    unlistedToken.address,
                    AMOUNT,
                    ZERO,
                    true,
                    false
                );
        });

        it('deposits when token1 is the native token and token2 is whitelisted', async () => {
            const { poolToken: poolToken1, token: whitelistedToken1 } = await preparePoolAndToken(TokenSymbol.ETH);
            const { poolToken: poolToken2, token: whitelistedToken2 } = await preparePoolAndToken(TokenSymbol.TKN1);
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

        it('deposits when token1 is unlisted and token2 is the native token', async () => {
            const { poolToken, token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.ETH);
            const unlistedToken = await createToken(new TokenData(TokenSymbol.TKN2));
            await uniswapV2Pair.setTokens(unlistedToken.address, whitelistedToken.address);
            await uniswapV2Factory.setTokens(unlistedToken.address, whitelistedToken.address);
            const res = await testMigrationDeposit([
                { reserveToken: unlistedToken },
                { reserveToken: whitelistedToken, poolToken }
            ]);
            await expect(res)
                .to.emit(bancorPortal, 'UniswapV2PositionMigrated')
                .withArgs(
                    user.address,
                    uniswapV2Pair.address,
                    unlistedToken.address,
                    whitelistedToken.address,
                    ZERO,
                    AMOUNT,
                    false,
                    true
                );
        });

        it('deposits when token1 is whitelisted and token2 is the native token', async () => {
            const { poolToken: poolToken1, token: whitelistedToken1 } = await preparePoolAndToken(TokenSymbol.TKN1);
            const { poolToken: poolToken2, token: whitelistedToken2 } = await preparePoolAndToken(TokenSymbol.ETH);
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

        it('deposits when token1 is bnt and token2 is unlisted', async () => {
            const { token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.TKN1);
            await networkSettings.setFundingLimit(whitelistedToken.address, FUNDING_LIMIT);
            await poolCollection.requestFundingT(CONTEXT_ID, whitelistedToken.address, AMOUNT);
            const unlistedToken = await createToken(new TokenData(TokenSymbol.TKN2));
            await uniswapV2Pair.setTokens(bnt.address, unlistedToken.address);
            await uniswapV2Factory.setTokens(bnt.address, unlistedToken.address);
            const res = await testMigrationDeposit([
                { reserveToken: bnt, poolToken: bntPoolToken },
                { reserveToken: unlistedToken }
            ]);
            await expect(res)
                .to.emit(bancorPortal, 'UniswapV2PositionMigrated')
                .withArgs(
                    user.address,
                    uniswapV2Pair.address,
                    bnt.address,
                    unlistedToken.address,
                    AMOUNT,
                    ZERO,
                    true,
                    false
                );
        });

        it('deposits when token1 is unlisted and token2 is bnt', async () => {
            const { token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.TKN1);
            await networkSettings.setFundingLimit(whitelistedToken.address, FUNDING_LIMIT);
            await poolCollection.requestFundingT(CONTEXT_ID, whitelistedToken.address, AMOUNT);
            const unlistedToken = await createToken(new TokenData(TokenSymbol.TKN2));
            await uniswapV2Pair.setTokens(unlistedToken.address, bnt.address);
            await uniswapV2Factory.setTokens(unlistedToken.address, bnt.address);
            const res = await testMigrationDeposit([
                { reserveToken: unlistedToken },
                { reserveToken: bnt, poolToken: bntPoolToken }
            ]);
            await expect(res)
                .to.emit(bancorPortal, 'UniswapV2PositionMigrated')
                .withArgs(
                    user.address,
                    uniswapV2Pair.address,
                    unlistedToken.address,
                    bnt.address,
                    ZERO,
                    AMOUNT,
                    false,
                    true
                );
        });

        it('deposits when token1 is bnt and token2 is whitelisted', async () => {
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

        it('deposits when token1 is whitelisted and token2 is bnt', async () => {
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

        it('emits a SushiSwap event post successful SushiSwap migration', async () => {
            const { poolToken, token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.TKN1);
            const unlistedToken = await createToken(new TokenData(TokenSymbol.TKN2));
            await uniswapV2Factory.setTokens(whitelistedToken.address, unlistedToken.address);
            await uniswapV2Pair.setTokens(whitelistedToken.address, unlistedToken.address);
            const res = await testMigrationDeposit(
                [{ reserveToken: whitelistedToken, poolToken }, { reserveToken: unlistedToken }],
                true
            );
            await expect(res)
                .to.emit(bancorPortal, 'SushiSwapV2PositionMigrated')
                .withArgs(
                    user.address,
                    uniswapV2Pair.address,
                    whitelistedToken.address,
                    unlistedToken.address,
                    AMOUNT,
                    ZERO,
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
            ? bancorPortal.connect(user).migrateSushiSwapV1Position
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
    ): Promise<AddressValueDictionary> => {
        const balances: AddressValueDictionary = {};
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
    ): Promise<AddressValueDictionary> => {
        const balances: { [address: string]: BigNumber } = {};
        for (const t of [token1, token2]) {
            if (isBNT(t)) {
                continue;
            }

            balances[t.address] = (await poolCollection.poolData(t.address)).liquidity[2];
        }
        return balances;
    };

    const getWhitelist = async (token1: TokenWithAddress, token2: TokenWithAddress): Promise<Whitelist> => {
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
});
