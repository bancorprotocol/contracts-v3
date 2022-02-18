import Contracts, {
    BancorPortal,
    NetworkSettings,
    TestBancorNetwork,
    TestPoolCollection,
    IERC20,
    BancorNetworkInfo,
    MockUniswapV2Router02,
    MockUniswapV2Pair,
    PoolToken,
    MockUniswapV2Factory
} from '../../components/Contracts';
import { ZERO_ADDRESS } from '../../utils/Constants';
import { TokenData, TokenSymbol, NATIVE_TOKEN_ADDRESS } from '../../utils/TokenData';
import { toWei } from '../../utils/Types';
import { createSystem, createToken, TokenWithAddress, createProxy, setupFundedPool } from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { transfer, getBalances, getTransactionCost } from '../helpers/Utils';
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

interface TokenAndPoolTokenBundle {
    token: TokenWithAddress;
    poolToken?: PoolToken;
}

describe('BancorPortal', () => {
    let network: TestBancorNetwork;
    let networkInfo: BancorNetworkInfo;
    let networkToken: IERC20;
    let masterPoolToken: PoolToken;
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

    shouldHaveGap('BancorPortal');

    before(async () => {
        [deployer, user] = await ethers.getSigners();
    });

    beforeEach(async () => {
        ({ network, networkSettings, networkToken, poolCollection, networkInfo, masterPoolToken } =
            await createSystem());
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
                networkToken.address,
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
            const token0 = await createToken(new TokenData(TokenSymbol.TKN));
            const token1 = await createToken(new TokenData(TokenSymbol.TKN1));
            await uniswapV2Pair.setTokens(token0.address, token1.address);
            await uniswapV2Factory.setTokens(token0.address, token1.address);

            await expect(
                bancorPortal.connect(user).migrateUniswapV2Position(token0.address, token1.address, 10)
            ).to.be.revertedWith('UnsupportedTokens');
        });

        it('reverts if the migration is not approved', async () => {
            const token0 = await createToken(new TokenData(TokenSymbol.TKN));
            const token1 = await createToken(new TokenData(TokenSymbol.TKN1));
            await uniswapV2Factory.setTokens(token0.address, token1.address);
            await expect(
                bancorPortal.connect(user).migrateUniswapV2Position(token0.address, token1.address, 10)
            ).to.be.revertedWith('ERC20: transfer amount exceeds allowance');
        });

        it('reverts if the input amount is 0', async () => {
            const token0 = await createToken(new TokenData(TokenSymbol.TKN));
            const token1 = await createToken(new TokenData(TokenSymbol.TKN1));
            await uniswapV2Factory.setTokens(token0.address, token1.address);
            await expect(
                bancorPortal.connect(user).migrateUniswapV2Position(token0.address, token1.address, 0)
            ).to.be.revertedWith('ZeroValue()');
        });

        it('reverts if there is no uniswap pair for specified tokens', async () => {
            await uniswapV2Pair.connect(user).approve(bancorPortal.address, AMOUNT);
            const token0 = await createToken(new TokenData(TokenSymbol.TKN));
            const token1 = await createToken(new TokenData(TokenSymbol.TKN1));
            await uniswapV2Pair.setTokens(token0.address, token1.address);
            await expect(
                bancorPortal.connect(user).migrateUniswapV2Position(token0.address, token1.address, 10)
            ).to.be.revertedWith('NoPairForTokens()');
        });

        it('returns the correct values', async () => {
            await uniswapV2Pair.connect(user).approve(bancorPortal.address, AMOUNT);
            const { poolToken: poolToken0, token: whitelistedToken0 } = await preparePoolAndToken(TokenSymbol.ETH);
            const { poolToken: poolToken1, token: whitelistedToken1 } = await preparePoolAndToken(TokenSymbol.TKN);
            await uniswapV2Pair.setTokens(whitelistedToken0.address, whitelistedToken1.address);
            await uniswapV2Factory.setTokens(whitelistedToken0.address, whitelistedToken1.address);
            const res = await testDeposit([
                { token: whitelistedToken0, poolToken: poolToken0 },
                { token: whitelistedToken1, poolToken: poolToken1 }
            ]);
            expect(res)
                .to.emit(bancorPortal, 'UniswapV2PositionMigrated')
                .withArgs(user.address, whitelistedToken0.address, whitelistedToken1.address, AMOUNT, AMOUNT);
        });
    });

    describe('construction', () => {
        const a = NATIVE_TOKEN_ADDRESS; // random valid address

        it('reverts when initializing with an invalid network contract', async () => {
            await expect(Contracts.BancorPortal.deploy(ZERO_ADDRESS, a, a, a, a, a, a)).to.be.revertedWith(
                'InvalidAddress'
            );
        });

        it('reverts when initializing with an invalid networkSettings contract', async () => {
            await expect(Contracts.BancorPortal.deploy(a, ZERO_ADDRESS, a, a, a, a, a)).to.be.revertedWith(
                'InvalidAddress'
            );
        });

        it('reverts when initializing with an invalid networkToken contract', async () => {
            await expect(Contracts.BancorPortal.deploy(a, a, ZERO_ADDRESS, a, a, a, a)).to.be.revertedWith(
                'InvalidAddress'
            );
        });

        it('reverts when initializing with an invalid uniswapV2Router contract', async () => {
            await expect(Contracts.BancorPortal.deploy(a, a, a, ZERO_ADDRESS, a, a, a)).to.be.revertedWith(
                'InvalidAddress'
            );
        });

        it('reverts when initializing with an invalid sushiswapV2Router contract', async () => {
            await expect(Contracts.BancorPortal.deploy(a, a, a, a, ZERO_ADDRESS, a, a)).to.be.revertedWith(
                'InvalidAddress'
            );
        });

        it('reverts when initializing with an invalid sushiswapV2Factory contract', async () => {
            await expect(Contracts.BancorPortal.deploy(a, a, a, a, a, ZERO_ADDRESS, a)).to.be.revertedWith(
                'InvalidAddress'
            );
        });

        it('reverts when initializing with an invalid network contract', async () => {
            await expect(Contracts.BancorPortal.deploy(a, a, a, a, a, a, ZERO_ADDRESS)).to.be.revertedWith(
                'InvalidAddress'
            );
        });

        it('should be initialized', async () => {
            expect(await bancorPortal.version()).to.equal(1);
        });
    });

    describe('transfers', () => {
        beforeEach(async () => {
            await uniswapV2Pair.connect(user).approve(bancorPortal.address, AMOUNT);
        });

        it("transfers funds to the user's wallet when only token0 is whitelisted", async () => {
            const { token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.TKN);
            const unlistedToken = await createToken(new TokenData(TokenSymbol.TKN1));
            await uniswapV2Pair.setTokens(whitelistedToken.address, unlistedToken.address);
            await uniswapV2Factory.setTokens(whitelistedToken.address, unlistedToken.address);
            await testTransfer(whitelistedToken, unlistedToken);
        });

        it("transfers funds to the user's wallet when only token1 is whitelisted", async () => {
            const { token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.TKN);
            const unlistedToken = await createToken(new TokenData(TokenSymbol.TKN1));
            await uniswapV2Pair.setTokens(unlistedToken.address, whitelistedToken.address);
            await uniswapV2Factory.setTokens(unlistedToken.address, whitelistedToken.address);
            await testTransfer(unlistedToken, whitelistedToken);
        });

        it("transfers funds to the user's wallet when token0 is the native token and token1 is whitelisted", async () => {
            const { token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.TKN);
            const unlistedToken = await createToken(new TokenData(TokenSymbol.ETH));
            await uniswapV2Pair.setTokens(unlistedToken.address, whitelistedToken.address);
            await uniswapV2Factory.setTokens(unlistedToken.address, whitelistedToken.address);
            await testTransfer(unlistedToken, whitelistedToken);
        });

        it("transfers funds to the user's wallet when token0 is whitelisted and token1 is the native token", async () => {
            const { token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.TKN);
            const unlistedToken = await createToken(new TokenData(TokenSymbol.ETH));
            await uniswapV2Pair.setTokens(whitelistedToken.address, unlistedToken.address);
            await uniswapV2Factory.setTokens(whitelistedToken.address, unlistedToken.address);
            await testTransfer(whitelistedToken, unlistedToken);
        });
    });

    describe('deposits', () => {
        beforeEach(async () => {
            await uniswapV2Pair.connect(user).approve(bancorPortal.address, AMOUNT);
        });

        it('deposits when only token0 is whitelisted', async () => {
            const { poolToken, token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.TKN);
            const unlistedToken = await createToken(new TokenData(TokenSymbol.TKN1));
            await uniswapV2Factory.setTokens(whitelistedToken.address, unlistedToken.address);
            await uniswapV2Pair.setTokens(whitelistedToken.address, unlistedToken.address);
            const res = await testDeposit([{ token: whitelistedToken, poolToken }, { token: unlistedToken }]);
            expect(res)
                .to.emit(bancorPortal, 'UniswapV2PositionMigrated')
                .withArgs(user.address, whitelistedToken.address, unlistedToken.address, AMOUNT, ZERO);
        });

        it('deposits when only token1 is whitelisted', async () => {
            const { poolToken, token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.TKN);
            const unlistedToken = await createToken(new TokenData(TokenSymbol.TKN1));
            await uniswapV2Pair.setTokens(unlistedToken.address, whitelistedToken.address);
            await uniswapV2Factory.setTokens(unlistedToken.address, whitelistedToken.address);
            const res = await testDeposit([{ token: unlistedToken }, { token: whitelistedToken, poolToken }]);
            expect(res)
                .to.emit(bancorPortal, 'UniswapV2PositionMigrated')
                .withArgs(user.address, unlistedToken.address, whitelistedToken.address, ZERO, AMOUNT);
        });

        it('deposits both tokens when possible', async () => {
            const { poolToken: poolToken0, token: token0 } = await preparePoolAndToken(TokenSymbol.TKN);
            const { poolToken: poolToken1, token: token1 } = await preparePoolAndToken(TokenSymbol.TKN1);
            await uniswapV2Pair.setTokens(token0.address, token1.address);
            await uniswapV2Factory.setTokens(token0.address, token1.address);
            const res = await testDeposit([
                { token: token0, poolToken: poolToken0 },
                { token: token1, poolToken: poolToken1 }
            ]);
            expect(res)
                .to.emit(bancorPortal, 'UniswapV2PositionMigrated')
                .withArgs(user.address, token0.address, token1.address, AMOUNT, AMOUNT);
        });

        it('deposits when token0 is the native token and token1 is unlisted', async () => {
            const { poolToken, token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.ETH);
            const unlistedToken = await createToken(new TokenData(TokenSymbol.TKN1));
            await uniswapV2Pair.setTokens(whitelistedToken.address, unlistedToken.address);
            await uniswapV2Factory.setTokens(whitelistedToken.address, unlistedToken.address);
            const res = await testDeposit([{ token: whitelistedToken, poolToken }, { token: unlistedToken }]);
            expect(res)
                .to.emit(bancorPortal, 'UniswapV2PositionMigrated')
                .withArgs(user.address, whitelistedToken.address, unlistedToken.address, AMOUNT, ZERO);
        });

        it('deposits when token0 is the native token and token1 is whitelisted', async () => {
            const { poolToken: poolToken0, token: whitelistedToken0 } = await preparePoolAndToken(TokenSymbol.ETH);
            const { poolToken: poolToken1, token: whitelistedToken1 } = await preparePoolAndToken(TokenSymbol.TKN);
            await uniswapV2Pair.setTokens(whitelistedToken0.address, whitelistedToken1.address);
            await uniswapV2Factory.setTokens(whitelistedToken0.address, whitelistedToken1.address);
            const res = await testDeposit([
                { token: whitelistedToken0, poolToken: poolToken0 },
                { token: whitelistedToken1, poolToken: poolToken1 }
            ]);
            expect(res)
                .to.emit(bancorPortal, 'UniswapV2PositionMigrated')
                .withArgs(user.address, whitelistedToken0.address, whitelistedToken1.address, AMOUNT, AMOUNT);
        });

        it('deposits when token0 is unlisted and token1 is the native token', async () => {
            const { poolToken, token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.ETH);
            const unlistedToken = await createToken(new TokenData(TokenSymbol.TKN1));
            await uniswapV2Pair.setTokens(unlistedToken.address, whitelistedToken.address);
            await uniswapV2Factory.setTokens(unlistedToken.address, whitelistedToken.address);
            const res = await testDeposit([{ token: unlistedToken }, { token: whitelistedToken, poolToken }]);
            expect(res)
                .to.emit(bancorPortal, 'UniswapV2PositionMigrated')
                .withArgs(user.address, unlistedToken.address, whitelistedToken.address, ZERO, AMOUNT);
        });

        it('deposits when token0 is whitelisted and token1 is the native token', async () => {
            const { poolToken: poolToken0, token: whitelistedToken0 } = await preparePoolAndToken(TokenSymbol.TKN);
            const { poolToken: poolToken1, token: whitelistedToken1 } = await preparePoolAndToken(TokenSymbol.ETH);
            await uniswapV2Pair.setTokens(whitelistedToken0.address, whitelistedToken1.address);
            await uniswapV2Factory.setTokens(whitelistedToken0.address, whitelistedToken1.address);
            const res = await testDeposit([
                { token: whitelistedToken0, poolToken: poolToken0 },
                { token: whitelistedToken1, poolToken: poolToken1 }
            ]);
            expect(res)
                .to.emit(bancorPortal, 'UniswapV2PositionMigrated')
                .withArgs(user.address, whitelistedToken0.address, whitelistedToken1.address, AMOUNT, AMOUNT);
        });

        it('deposits when token0 is bnt and token1 is unlisted', async () => {
            const { token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.TKN);
            await networkSettings.setFundingLimit(whitelistedToken.address, FUNDING_LIMIT);
            await poolCollection.requestFundingT(CONTEXT_ID, whitelistedToken.address, AMOUNT);
            const unlistedToken = await createToken(new TokenData(TokenSymbol.TKN1));
            await uniswapV2Pair.setTokens(networkToken.address, unlistedToken.address);
            await uniswapV2Factory.setTokens(networkToken.address, unlistedToken.address);
            const res = await testDeposit([
                { token: networkToken, poolToken: masterPoolToken },
                { token: unlistedToken }
            ]);
            expect(res)
                .to.emit(bancorPortal, 'UniswapV2PositionMigrated')
                .withArgs(user.address, networkToken.address, unlistedToken.address, AMOUNT, ZERO);
        });

        it('deposits when token0 is unlisted and token1 is bnt', async () => {
            const { token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.TKN);
            await networkSettings.setFundingLimit(whitelistedToken.address, FUNDING_LIMIT);
            await poolCollection.requestFundingT(CONTEXT_ID, whitelistedToken.address, AMOUNT);
            const unlistedToken = await createToken(new TokenData(TokenSymbol.TKN1));
            await uniswapV2Pair.setTokens(unlistedToken.address, networkToken.address);
            await uniswapV2Factory.setTokens(unlistedToken.address, networkToken.address);
            const res = await testDeposit([
                { token: unlistedToken },
                { token: networkToken, poolToken: masterPoolToken }
            ]);
            expect(res)
                .to.emit(bancorPortal, 'UniswapV2PositionMigrated')
                .withArgs(user.address, unlistedToken.address, networkToken.address, ZERO, AMOUNT);
        });

        it('deposits when token0 is bnt and token1 is whitelisted', async () => {
            const { poolToken, token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.TKN);
            await networkSettings.setFundingLimit(whitelistedToken.address, FUNDING_LIMIT);
            await poolCollection.requestFundingT(CONTEXT_ID, whitelistedToken.address, AMOUNT);
            await uniswapV2Pair.setTokens(networkToken.address, whitelistedToken.address);
            await uniswapV2Factory.setTokens(networkToken.address, whitelistedToken.address);
            const res = await testDeposit([
                { token: networkToken, poolToken: masterPoolToken },
                { token: whitelistedToken, poolToken }
            ]);
            expect(res)
                .to.emit(bancorPortal, 'UniswapV2PositionMigrated')
                .withArgs(user.address, networkToken.address, whitelistedToken.address, AMOUNT, AMOUNT);
        });

        it('deposits when token0 is whitelisted and token1 is bnt', async () => {
            const { poolToken, token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.TKN);
            await networkSettings.setFundingLimit(whitelistedToken.address, FUNDING_LIMIT);
            await poolCollection.requestFundingT(CONTEXT_ID, whitelistedToken.address, AMOUNT);
            await uniswapV2Pair.setTokens(whitelistedToken.address, networkToken.address);
            await uniswapV2Factory.setTokens(whitelistedToken.address, networkToken.address);
            const res = await testDeposit([
                { token: whitelistedToken, poolToken },
                { token: networkToken, poolToken: masterPoolToken }
            ]);
            expect(res)
                .to.emit(bancorPortal, 'UniswapV2PositionMigrated')
                .withArgs(user.address, whitelistedToken.address, networkToken.address, AMOUNT, AMOUNT);
        });
    });

    // it is assumed sushiswap is identical to uniswap and therefore already tested.
    // this block is intended to verify the existance of a sushiswap external function, and its io signature.
    describe('SushiSwap', () => {
        beforeEach(async () => {
            await uniswapV2Pair.connect(user).approve(bancorPortal.address, AMOUNT);
        });

        it('emits a sushiswap event post succesful sushiswap migration', async () => {
            const { poolToken, token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.TKN);
            const unlistedToken = await createToken(new TokenData(TokenSymbol.TKN1));
            await uniswapV2Factory.setTokens(whitelistedToken.address, unlistedToken.address);
            await uniswapV2Pair.setTokens(whitelistedToken.address, unlistedToken.address);
            const res = await testDeposit([{ token: whitelistedToken, poolToken }, { token: unlistedToken }], true);
            expect(res)
                .to.emit(bancorPortal, 'SushiswapV2PositionMigrated')
                .withArgs(user.address, whitelistedToken.address, unlistedToken.address, AMOUNT, ZERO);
        });
    });

    const testTransfer = async (token0: TokenWithAddress, token1: TokenWithAddress) => {
        // prepare uniswap mocks
        await transfer(deployer, token0, uniswapV2Pair.address, AMOUNT);
        await transfer(deployer, token1, uniswapV2Pair.address, AMOUNT);
        if (isNativeToken(token0) || isNativeToken(token1)) {
            deployer.sendTransaction({ to: uniswapV2Pair.address, value: AMOUNT });
        }

        // save state
        const previousBalances = await getBalances([token0, token1], user);

        // execute
        const res = await bancorPortal.connect(user).migrateUniswapV2Position(token0.address, token1.address, AMOUNT);

        // assert
        const newBalances = await getBalances([token0, token1], user);
        const whitelist = await getWhitelist(token0, token1);
        if (whitelist[token0.address] && whitelist[token1.address]) {
            expect(newBalances[token0.address].eq(previousBalances[token0.address].add(AMOUNT))).to.be.true;
            expect(newBalances[token1.address].eq(previousBalances[token1.address].add(AMOUNT))).to.be.true;
        } else {
            if (whitelist[token0.address]) {
                const transactionCost = isNativeToken(token1) ? await getTransactionCost(res) : 0;
                expect(newBalances[token0.address].eq(previousBalances[token0.address])).to.be.true;
                expect(
                    newBalances[token1.address].eq(previousBalances[token1.address].add(AMOUNT).sub(transactionCost))
                ).to.be.true;
            } else {
                const transactionCost = isNativeToken(token0) ? await getTransactionCost(res) : 0;
                expect(
                    newBalances[token0.address].eq(previousBalances[token0.address].add(AMOUNT).sub(transactionCost))
                ).to.be.true;
                expect(newBalances[token1.address].eq(previousBalances[token1.address])).to.be.true;
            }
        }
    };

    const testDeposit = async (bundles: TokenAndPoolTokenBundle[], sushiSwap = false): Promise<ContractTransaction> => {
        // fund uniswap mock
        await transfer(deployer, bundles[0].token, uniswapV2Pair.address, AMOUNT);
        await transfer(deployer, bundles[1].token, uniswapV2Pair.address, AMOUNT);

        // save state
        const previousStakedBalances = await getStakedBalances(bundles[0].token, bundles[1].token);
        const previousPoolTokenBalances = await getPoolTokenBalances(bundles[0].poolToken, bundles[1].poolToken);
        const whitelist = await getWhitelist(bundles[0].token, bundles[1].token);

        // execute
        const migrationFuction = sushiSwap
            ? bancorPortal.connect(user).migrateSushiswapV1Position
            : bancorPortal.connect(user).migrateUniswapV2Position;
        const res = await migrationFuction(bundles[0].token.address, bundles[1].token.address, AMOUNT);
        const newStakedBalances = await getStakedBalances(bundles[0].token, bundles[1].token);
        const newPoolTokenBalances = await getPoolTokenBalances(bundles[0].poolToken, bundles[1].poolToken);

        // assert staked balances
        for (const t of bundles.map((b) => b.token)) {
            if (isNetworkToken(t)) continue;

            if (whitelist[t.address]) {
                expect(newStakedBalances[t.address]).to.equal(previousStakedBalances[t.address].add(AMOUNT));
            } else {
                expect(newStakedBalances[t.address]).to.equal(previousStakedBalances[t.address]);
            }
        }

        // assert poolToken balances
        for (const bundle of bundles) {
            if (bundle.poolToken && whitelist[bundle.token.address]) {
                expect(newPoolTokenBalances[bundle.poolToken.address]).to.equal(
                    previousPoolTokenBalances[bundle.poolToken.address].add(AMOUNT)
                );
            }
        }

        return res;
    };

    const getPoolTokenBalances = async (
        poolToken0?: PoolToken,
        poolToken1?: PoolToken
    ): Promise<AddressValueDictionary> => {
        const balances: AddressValueDictionary = {};
        for (const t of [poolToken0, poolToken1]) {
            if (t) {
                balances[t.address] = await t.balanceOf(user.address);
            }
        }
        return balances;
    };

    const getStakedBalances = async (
        token0: TokenWithAddress,
        token1: TokenWithAddress
    ): Promise<AddressValueDictionary> => {
        const balances: { [address: string]: BigNumber } = {};
        for (const t of [token0, token1]) {
            if (isNetworkToken(t)) continue;

            balances[t.address] = (await poolCollection.poolData(t.address)).liquidity[2];
        }
        return balances;
    };

    const getWhitelist = async (token0: TokenWithAddress, token1: TokenWithAddress): Promise<Whitelist> => {
        return {
            [token0.address]: isNetworkToken(token0) || (await networkSettings.isTokenWhitelisted(token0.address)),
            [token1.address]: isNetworkToken(token1) || (await networkSettings.isTokenWhitelisted(token1.address))
        };
    };

    const preparePoolAndToken = async (symbol: TokenSymbol) => {
        const balance = toWei(100_000_000);
        const { poolToken, token } = await setupFundedPool(
            {
                tokenData: new TokenData(symbol),
                balance: balance,
                requestedLiquidity: balance.mul(1000),
                fundingRate: { n: 1, d: 2 }
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

    const isNetworkToken = (token: TokenWithAddress): boolean => {
        return token.address === networkToken.address;
    };
});
