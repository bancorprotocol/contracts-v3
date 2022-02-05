import Contracts, {
    V3Migrator,
    NetworkSettings,
    TestBancorNetwork,
    TestPoolCollection,
    IERC20,
    BancorNetworkInfo,
    MockUniswapV2Router02,
    MockUniswapV2Pair
} from '../../components/Contracts';
import { TokenData, TokenSymbol, NATIVE_TOKEN_ADDRESS } from '../../utils/TokenData';
import { Addressable, toWei } from '../../utils/Types';
import { createSystem, createToken, TokenWithAddress, createProxy, setupFundedPool } from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { transfer, getBalances, getTransactionCost } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';

interface Whitelist {
    [address: string]: boolean;
}

interface PoolBalances {
    [address: string]: BigNumber;
}

describe.only('V3-Migrator', () => {
    // shouldHaveGap('V3Migrator', '_network');
    let network: TestBancorNetwork;
    let networkInfo: BancorNetworkInfo;
    let networkToken: IERC20;
    let networkSettings: NetworkSettings;
    let poolCollection: TestPoolCollection;
    let v3Migrator: V3Migrator;
    let uniswapV2Pair: MockUniswapV2Pair;
    let uniswapV2Router02: MockUniswapV2Router02;
    let deployer: SignerWithAddress;
    let user: SignerWithAddress;

    const amount = 1000;

    before(async () => {
        [deployer, user] = await ethers.getSigners();
    });

    beforeEach(async () => {
        ({ network, networkSettings, networkToken, poolCollection, networkInfo } = await createSystem());
        uniswapV2Pair = await Contracts.MockUniswapV2Pair.deploy(
            'UniswapV2Pair',
            'UniswapV2Pair',
            BigNumber.from(1_000_000)
        );
        uniswapV2Router02 = await Contracts.MockUniswapV2Router02.deploy(
            'UniswapV2Router02',
            'UniswapV2Router02',
            BigNumber.from(1_000_000),
            uniswapV2Pair.address
        );
        v3Migrator = await createProxy(Contracts.V3Migrator, {
            ctorArgs: [network.address, networkSettings.address, uniswapV2Router02.address, networkToken.address]
        });

        await uniswapV2Pair.transfer(user.address, BigNumber.from(1_000_000));
    });

    it("reverts when none of the pair's tokens are whitelisted", async () => {
        await uniswapV2Pair.connect(user).approve(v3Migrator.address, amount);
        const token0 = await createToken(new TokenData(TokenSymbol.TKN));
        const token1 = await createToken(new TokenData(TokenSymbol.TKN1));
        await uniswapV2Pair.setTokens(token0.address, token1.address);
        await expect(v3Migrator.connect(user).migrateUniswapV2Position(uniswapV2Pair.address, 10)).to.be.revertedWith(
            'NotWhiteListed'
        );
    });

    it('reverts if the migration is not approved', async () => {
        await expect(v3Migrator.connect(user).migrateUniswapV2Position(uniswapV2Pair.address, 10)).to.be.revertedWith(
            'ERC20: transfer amount exceeds allowance'
        );
    });

    describe('transfers', () => {
        it("transfers funds to the user's wallet when only token0 is whitelisted", async () => {
            await uniswapV2Pair.connect(user).approve(v3Migrator.address, amount);
            const { token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.TKN);
            const unlistedToken = await createToken(new TokenData(TokenSymbol.TKN1));
            await uniswapV2Pair.setTokens(whitelistedToken.address, unlistedToken.address);
            await testTransfer(whitelistedToken, unlistedToken);
        });

        it("transfers funds to the user's wallet when only token1 is whitelisted", async () => {
            await uniswapV2Pair.connect(user).approve(v3Migrator.address, amount);
            const { token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.TKN);
            const unlistedToken = await createToken(new TokenData(TokenSymbol.TKN1));
            await uniswapV2Pair.setTokens(unlistedToken.address, whitelistedToken.address);
            await testTransfer(whitelistedToken, unlistedToken);
        });

        it("transfers funds to the user's wallet when token0 is eth and token1 is whitelisted", async () => {
            await uniswapV2Pair.connect(user).approve(v3Migrator.address, amount);
            const { token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.TKN);
            const unlistedToken = await createToken(new TokenData(TokenSymbol.ETH));
            await uniswapV2Pair.setTokens(unlistedToken.address, whitelistedToken.address);
            await testTransfer(whitelistedToken, unlistedToken);
        });

        it("transfers funds to the user's wallet when token0 is whitelisted and token1 is eth", async () => {
            await uniswapV2Pair.connect(user).approve(v3Migrator.address, amount);
            const { token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.TKN);
            const unlistedToken = await createToken(new TokenData(TokenSymbol.ETH));
            await uniswapV2Pair.setTokens(whitelistedToken.address, unlistedToken.address);
            await testTransfer(whitelistedToken, unlistedToken);
        });
    });

    describe('deposits', () => {
        it('deposits funds when only token0 is whitelisted', async () => {
            await uniswapV2Pair.connect(user).approve(v3Migrator.address, amount);
            const { token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.TKN);
            const unlistedToken = await createToken(new TokenData(TokenSymbol.TKN1));
            await uniswapV2Pair.setTokens(whitelistedToken.address, unlistedToken.address);
            await testDeposit(whitelistedToken, unlistedToken);
        });

        it('deposits funds when only token1 is whitelisted', async () => {
            await uniswapV2Pair.connect(user).approve(v3Migrator.address, amount);
            const { token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.TKN);
            const unlistedToken = await createToken(new TokenData(TokenSymbol.TKN1));
            await uniswapV2Pair.setTokens(unlistedToken.address, whitelistedToken.address);
            await testDeposit(whitelistedToken, unlistedToken);
        });

        it('deposits funds of both tokens when possible', async () => {
            await uniswapV2Pair.connect(user).approve(v3Migrator.address, amount);
            const { token: token0 } = await preparePoolAndToken(TokenSymbol.TKN);
            const { token: token1 } = await preparePoolAndToken(TokenSymbol.TKN1);
            await uniswapV2Pair.setTokens(token0.address, token1.address);
            await testDeposit(token0, token1);
        });

        it('deposits funds when token0 is eth and token1 is unlisted', async () => {
            await uniswapV2Pair.connect(user).approve(v3Migrator.address, amount);
            const { token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.ETH);
            const unlistedToken = await createToken(new TokenData(TokenSymbol.TKN1));
            await uniswapV2Pair.setTokens(whitelistedToken.address, unlistedToken.address);
            await testDeposit(whitelistedToken, unlistedToken);
        });

        it('deposits funds when token0 is eth and token1 is whitelisted', async () => {
            await uniswapV2Pair.connect(user).approve(v3Migrator.address, amount);
            const { token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.ETH);
            const { token: whitelistedToken1 } = await preparePoolAndToken(TokenSymbol.TKN);
            await uniswapV2Pair.setTokens(whitelistedToken.address, whitelistedToken1.address);
            await testDeposit(whitelistedToken, whitelistedToken1);
        });

        it('deposits funds when token0 is unlisted and token1 is eth', async () => {
            await uniswapV2Pair.connect(user).approve(v3Migrator.address, amount);
            const { token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.ETH);
            const unlistedToken = await createToken(new TokenData(TokenSymbol.TKN1));
            await uniswapV2Pair.setTokens(unlistedToken.address, whitelistedToken.address);
            await testDeposit(whitelistedToken, unlistedToken);
        });

        it('deposits funds when token0 is whitelisted and token1 is eth', async () => {
            await uniswapV2Pair.connect(user).approve(v3Migrator.address, amount);
            const { token: whitelistedToken } = await preparePoolAndToken(TokenSymbol.ETH);
            const { token: whitelistedToken1 } = await preparePoolAndToken(TokenSymbol.TKN);
            await uniswapV2Pair.setTokens(whitelistedToken1.address, whitelistedToken.address);
            await testDeposit(whitelistedToken, whitelistedToken1);
        });
    });

    const testTransfer = async (token0: TokenWithAddress, token1: TokenWithAddress) => {
        // prepare uniswap mocks
        await transfer(deployer, token0, uniswapV2Pair.address, amount);
        await transfer(deployer, token1, uniswapV2Pair.address, amount);
        deployer.sendTransaction({ to: uniswapV2Pair.address, value: amount });

        // save state
        const previousBalances = await getBalances([token0, token1], user);

        // execute
        const res = await v3Migrator.connect(user).migrateUniswapV2Position(uniswapV2Pair.address, amount);

        // assert
        const newBalances = await getBalances([token0, token1], user);
        const whitelist = await getWhitelist(token0.address, token1.address);
        if (whitelist[token0.address] && whitelist[token1.address]) {
            expect(newBalances[token0.address].eq(previousBalances[token0.address].add(amount))).to.be.true;
            expect(newBalances[token1.address].eq(previousBalances[token1.address].add(amount))).to.be.true;
        } else {
            if (whitelist[token0.address]) {
                const transactionCost = isNativeToken(token1) ? await getTransactionCost(res) : 0;
                expect(newBalances[token0.address].eq(previousBalances[token0.address])).to.be.true;
                expect(
                    newBalances[token1.address].eq(previousBalances[token1.address].add(amount).sub(transactionCost))
                ).to.be.true;
            } else {
                const transactionCost = isNativeToken(token0) ? await getTransactionCost(res) : 0;
                console.log(transactionCost);
                expect(
                    newBalances[token0.address].eq(previousBalances[token0.address].add(amount).sub(transactionCost))
                ).to.be.true;
                expect(newBalances[token1.address].eq(previousBalances[token1.address])).to.be.true;
            }
        }
    };

    const testDeposit = async (token0: TokenWithAddress, token1: TokenWithAddress) => {
        // prepare variables
        await transfer(deployer, token0, uniswapV2Pair.address, amount);
        await transfer(deployer, token1, uniswapV2Pair.address, amount);

        // save state
        const previousBalances = await getPoolBalances(token0, token1);

        // execute
        await v3Migrator.connect(user).migrateUniswapV2Position(uniswapV2Pair.address, amount);

        // assert
        const newBalances = await getPoolBalances(token0, token1);
        const whitelist = await getWhitelist(token0.address, token1.address);
        if (whitelist[token0.address] && whitelist[token1.address]) {
            expect(newBalances[token0.address].eq(previousBalances[token0.address].add(amount))).to.be.true;
            expect(newBalances[token1.address].eq(previousBalances[token1.address].add(amount))).to.be.true;
        } else {
            if (whitelist[token0.address]) {
                expect(newBalances[token0.address].eq(previousBalances[token0.address].add(amount))).to.be.true;
                expect(newBalances[token1.address].eq(previousBalances[token1.address])).to.be.true;
            } else {
                expect(newBalances[token1.address].eq(previousBalances[token1.address].add(amount))).to.be.true;
                expect(newBalances[token0.address].eq(previousBalances[token0.address])).to.be.true;
            }
        }
    };

    const getPoolBalances = async (token0: TokenWithAddress, token1: TokenWithAddress): Promise<PoolBalances> => {
        const balances: { [address: string]: BigNumber } = {};
        balances[token0.address] = (await poolCollection.poolData(token0.address)).liquidity[2];
        balances[token1.address] = (await poolCollection.poolData(token1.address)).liquidity[2];
        return balances;
    };

    const getWhitelist = async (token0: string, token1: string): Promise<Whitelist> => {
        const whitelist: Whitelist = {};
        whitelist[token0] = await networkSettings.isTokenWhitelisted(token0);
        whitelist[token1] = await networkSettings.isTokenWhitelisted(token1);
        return whitelist;
    };

    const preparePoolAndToken = async (symbol: TokenSymbol) => {
        const balance = toWei(1_000_000);
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
});
