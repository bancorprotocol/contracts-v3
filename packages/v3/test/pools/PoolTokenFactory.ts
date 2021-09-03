import Contracts from '../../components/Contracts';
import { TestERC20Token, PoolTokenFactory } from '../../typechain';
import { ZERO_ADDRESS } from '../helpers/Constants';
import { createSystem, createPoolToken } from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { TokenWithAddress, getTokenBySymbol } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';

describe('PoolTokenFactory', () => {
    const SYMBOL = 'TKN';
    const DECIMALS = BigNumber.from(18);

    let deployer: SignerWithAddress;
    let nonOwner: SignerWithAddress;

    shouldHaveGap('PoolTokenFactory', '_tokenSymbolOverrides');

    before(async () => {
        [deployer, nonOwner] = await ethers.getSigners();
    });

    describe('construction', () => {
        it('should revert when attempting to reinitialize', async () => {
            const { poolTokenFactory } = await createSystem();

            await expect(poolTokenFactory.initialize()).to.be.revertedWith(
                'Initializable: contract is already initialized'
            );
        });
    });

    describe('token symbol overrides', async () => {
        const EMPTY_STRING = '';
        const newSymbol = 'TKN2';

        let poolTokenFactory: PoolTokenFactory;
        let reserveToken: TestERC20Token;

        beforeEach(async () => {
            ({ poolTokenFactory } = await createSystem());

            reserveToken = await Contracts.TestERC20Token.deploy(SYMBOL, SYMBOL, BigNumber.from(1_000_000));
        });

        it('should revert when a non-owner attempts to set a token symbol override', async () => {
            await expect(
                poolTokenFactory.connect(nonOwner).setTokenSymbolOverride(reserveToken.address, newSymbol)
            ).to.be.revertedWith('ERR_ACCESS_DENIED');
        });

        it('should be able to set and update a token symbol override', async () => {
            expect(await poolTokenFactory.tokenSymbolOverride(reserveToken.address)).to.equal(EMPTY_STRING);

            await poolTokenFactory.setTokenSymbolOverride(reserveToken.address, newSymbol);
            expect(await poolTokenFactory.tokenSymbolOverride(reserveToken.address)).to.equal(newSymbol);

            await poolTokenFactory.setTokenSymbolOverride(reserveToken.address, SYMBOL);
            expect(await poolTokenFactory.tokenSymbolOverride(reserveToken.address)).to.equal(SYMBOL);

            await poolTokenFactory.setTokenSymbolOverride(reserveToken.address, EMPTY_STRING);
            expect(await poolTokenFactory.tokenSymbolOverride(reserveToken.address)).to.equal(EMPTY_STRING);
        });
    });

    describe('token decimal overrides', async () => {
        const newDecimals = 9;

        let poolTokenFactory: PoolTokenFactory;
        let reserveToken: TestERC20Token;

        beforeEach(async () => {
            ({ poolTokenFactory } = await createSystem());

            reserveToken = await Contracts.TestERC20Token.deploy(SYMBOL, SYMBOL, BigNumber.from(1_000_000));
        });

        it('should revert when a non-owner attempts to set a token decimal override', async () => {
            await expect(
                poolTokenFactory.connect(nonOwner).setTokenDecimalsOverride(reserveToken.address, newDecimals)
            ).to.be.revertedWith('ERR_ACCESS_DENIED');
        });

        it('should be able to set and update a token decimal override', async () => {
            expect(await poolTokenFactory.tokenDecimalsOverride(reserveToken.address)).to.equal(0);

            await poolTokenFactory.setTokenDecimalsOverride(reserveToken.address, newDecimals);
            expect(await poolTokenFactory.tokenDecimalsOverride(reserveToken.address)).to.equal(newDecimals);

            await poolTokenFactory.setTokenDecimalsOverride(reserveToken.address, DECIMALS);
            expect(await poolTokenFactory.tokenDecimalsOverride(reserveToken.address)).to.equal(DECIMALS);

            await poolTokenFactory.setTokenDecimalsOverride(reserveToken.address, 0);
            expect(await poolTokenFactory.tokenDecimalsOverride(reserveToken.address)).to.equal(0);
        });
    });

    describe('create pool token', () => {
        let networkToken: TestERC20Token;
        let poolTokenFactory: PoolTokenFactory;
        let reserveToken: TokenWithAddress;

        const poolTokenSymbol = (symbol: string) => `bn${symbol}`;
        const poolTokenName = (symbol: string) => `Bancor ${symbol} Pool Token`;

        const testCreatePoolToken = (symbol: string) => {
            beforeEach(async () => {
                ({ networkToken, poolTokenFactory } = await createSystem());

                reserveToken = await getTokenBySymbol(symbol, networkToken);
            });

            it('should revert when attempting to create a pool for an invalid token', async () => {
                await expect(createPoolToken(poolTokenFactory, ZERO_ADDRESS)).to.be.revertedWith('ERR_INVALID_ADDRESS');
            });

            it('should create a pool token and transfer ownership', async () => {
                const poolToken = await Contracts.PoolToken.attach(
                    await poolTokenFactory.callStatic.createPoolToken(reserveToken.address)
                );

                const res = await poolTokenFactory.createPoolToken(reserveToken.address);
                await expect(res)
                    .to.emit(poolTokenFactory, 'PoolTokenCreated')
                    .withArgs(poolToken.address, reserveToken.address);

                expect(await poolToken.reserveToken()).to.equal(reserveToken.address);
                expect(await poolToken.symbol()).to.equal(poolTokenSymbol(symbol));
                expect(await poolToken.name()).to.equal(poolTokenName(symbol));
                expect(await poolToken.decimals()).to.equal(DECIMALS);

                expect(await poolToken.newOwner()).to.equal(deployer.address);
                await poolToken.acceptOwnership();
                expect(await poolToken.owner()).to.equal(deployer.address);
            });

            context('with a token symbol override', () => {
                const newSymbol = 'TKN2';

                beforeEach(async () => {
                    await poolTokenFactory.setTokenSymbolOverride(reserveToken.address, newSymbol);
                });

                it('should create a pool', async () => {
                    const poolToken = await createPoolToken(poolTokenFactory, reserveToken.address);

                    expect(await poolToken.reserveToken()).to.equal(reserveToken.address);
                    expect(await poolToken.symbol()).to.equal(poolTokenSymbol(newSymbol));
                    expect(await poolToken.name()).to.equal(poolTokenName(newSymbol));
                    expect(await poolToken.decimals()).to.equal(DECIMALS);
                });
            });

            context('with a token symbol override', () => {
                const newDecimals = 4;

                beforeEach(async () => {
                    await poolTokenFactory.setTokenDecimalsOverride(reserveToken.address, newDecimals);
                });

                it('should create a pool', async () => {
                    const poolToken = await createPoolToken(poolTokenFactory, reserveToken.address);

                    expect(await poolToken.reserveToken()).to.equal(reserveToken.address);
                    expect(await poolToken.symbol()).to.equal(poolTokenSymbol(symbol));
                    expect(await poolToken.name()).to.equal(poolTokenName(symbol));
                    expect(await poolToken.decimals()).to.equal(newDecimals);
                });
            });
        };

        for (const symbol of ['ETH', 'TKN']) {
            context(symbol, () => {
                testCreatePoolToken(symbol);
            });
        }
    });
});
