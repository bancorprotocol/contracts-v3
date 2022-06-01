import Contracts, { PoolTokenFactory, TestERC20Token } from '../../components/Contracts';
import { ZERO_ADDRESS } from '../../utils/Constants';
import { DEFAULT_DECIMALS, TokenData, TokenSymbol } from '../../utils/TokenData';
import { expectRole, expectRoles, Roles } from '../helpers/AccessControl';
import { createPoolToken, createSystem, createTestToken, createToken, TokenWithAddress } from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('PoolTokenFactory', () => {
    let deployer: SignerWithAddress;
    let nonOwner: SignerWithAddress;

    shouldHaveGap('PoolTokenFactory', '_tokenSymbolOverrides');

    before(async () => {
        [deployer, nonOwner] = await ethers.getSigners();
    });

    describe('construction', () => {
        let poolTokenFactory: PoolTokenFactory;

        beforeEach(async () => {
            ({ poolTokenFactory } = await createSystem());
        });

        it('should revert when attempting to reinitialize', async () => {
            await expect(poolTokenFactory.initialize()).to.be.revertedWithError(
                'Initializable: contract is already initialized'
            );
        });

        it('should be properly initialized', async () => {
            expect(await poolTokenFactory.version()).to.equal(1);

            await expectRoles(poolTokenFactory, Roles.Upgradeable);

            await expectRole(poolTokenFactory, Roles.Upgradeable.ROLE_ADMIN, Roles.Upgradeable.ROLE_ADMIN, [
                deployer.address
            ]);
        });
    });

    describe('token symbol overrides', async () => {
        const EMPTY_STRING = '';
        const newSymbol = 'TKN2';

        let poolTokenFactory: PoolTokenFactory;
        let reserveToken: TestERC20Token;

        beforeEach(async () => {
            ({ poolTokenFactory } = await createSystem());

            reserveToken = await createTestToken();
        });

        it('should revert when a non-owner attempts to set a token symbol override', async () => {
            await expect(
                poolTokenFactory.connect(nonOwner).setTokenSymbolOverride(reserveToken.address, newSymbol)
            ).to.be.revertedWithError('AccessDenied');
        });

        it('should be able to set and update a token symbol override', async () => {
            expect(await poolTokenFactory.tokenSymbolOverride(reserveToken.address)).to.equal(EMPTY_STRING);

            await poolTokenFactory.setTokenSymbolOverride(reserveToken.address, newSymbol);
            expect(await poolTokenFactory.tokenSymbolOverride(reserveToken.address)).to.equal(newSymbol);

            await poolTokenFactory.setTokenSymbolOverride(reserveToken.address, TokenSymbol.TKN);
            expect(await poolTokenFactory.tokenSymbolOverride(reserveToken.address)).to.equal(TokenSymbol.TKN);

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

            reserveToken = await createTestToken();
        });

        it('should revert when a non-owner attempts to set a token decimal override', async () => {
            await expect(
                poolTokenFactory.connect(nonOwner).setTokenDecimalsOverride(reserveToken.address, newDecimals)
            ).to.be.revertedWithError('AccessDenied');
        });

        it('should be able to set and update a token decimal override', async () => {
            expect(await poolTokenFactory.tokenDecimalsOverride(reserveToken.address)).to.equal(0);

            await poolTokenFactory.setTokenDecimalsOverride(reserveToken.address, newDecimals);
            expect(await poolTokenFactory.tokenDecimalsOverride(reserveToken.address)).to.equal(newDecimals);

            await poolTokenFactory.setTokenDecimalsOverride(reserveToken.address, DEFAULT_DECIMALS);
            expect(await poolTokenFactory.tokenDecimalsOverride(reserveToken.address)).to.equal(DEFAULT_DECIMALS);

            await poolTokenFactory.setTokenDecimalsOverride(reserveToken.address, 0);
            expect(await poolTokenFactory.tokenDecimalsOverride(reserveToken.address)).to.equal(0);
        });
    });

    describe('create pool token', () => {
        let poolTokenFactory: PoolTokenFactory;
        let reserveToken: TokenWithAddress;

        const poolTokenSymbol = (symbol: string) => `bn${symbol}`;
        const poolTokenName = (symbol: string) => `Bancor ${symbol} Pool Token`;

        const testCreatePoolToken = (tokenData: TokenData) => {
            beforeEach(async () => {
                ({ poolTokenFactory } = await createSystem());

                reserveToken = await createToken(tokenData);
            });

            it('should revert when attempting to create a pool for an invalid token', async () => {
                await expect(createPoolToken(poolTokenFactory, ZERO_ADDRESS)).to.be.revertedWithError('InvalidAddress');
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
                expect(await poolToken.symbol()).to.equal(poolTokenSymbol(tokenData.symbol()));
                expect(await poolToken.name()).to.equal(poolTokenName(tokenData.symbol()));
                expect(await poolToken.decimals()).to.equal(DEFAULT_DECIMALS);

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
                    expect(await poolToken.decimals()).to.equal(DEFAULT_DECIMALS);
                });
            });

            context('with a token decimals override', () => {
                const newDecimals = 4;

                beforeEach(async () => {
                    await poolTokenFactory.setTokenDecimalsOverride(reserveToken.address, newDecimals);
                });

                it('should create a pool', async () => {
                    const poolToken = await createPoolToken(poolTokenFactory, reserveToken.address);

                    expect(await poolToken.reserveToken()).to.equal(reserveToken.address);
                    expect(await poolToken.symbol()).to.equal(poolTokenSymbol(tokenData.symbol()));
                    expect(await poolToken.name()).to.equal(poolTokenName(tokenData.symbol()));
                    expect(await poolToken.decimals()).to.equal(newDecimals);
                });
            });
        };

        for (const symbol of [TokenSymbol.ETH, TokenSymbol.TKN]) {
            context(symbol, () => {
                testCreatePoolToken(new TokenData(symbol));
            });
        }
    });
});
