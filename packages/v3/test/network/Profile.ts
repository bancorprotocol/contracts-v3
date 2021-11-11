import { AsyncReturnType } from '../../components/ContractBuilder';
import Contracts from '../../components/Contracts';
import { GovToken, NetworkToken } from '../../components/LegacyContracts';
import {
    BancorVault,
    NetworkSettings,
    PoolToken,
    PoolTokenFactory,
    TestBancorNetwork,
    TestFlashLoanRecipient,
    TestNetworkTokenPool,
    TestPendingWithdrawals,
    TestPoolCollection,
    TestPoolCollectionUpgrader,
    TestERC20Burnable,
    PendingWithdrawals,
    TokenHolder
} from '../../typechain';
import { expectRole, roles } from '../helpers/AccessControl';
import { FeeTypes, MAX_UINT256, NATIVE_TOKEN_ADDRESS, PPM_RESOLUTION, ZERO_ADDRESS } from '../helpers/Constants';
import { BNT, ETH, TKN } from '../helpers/Constants';
import {
    createPool,
    createPoolCollection,
    createSystem,
    createTokenHolder,
    depositToPool,
    setupSimplePool,
    PoolSpec
} from '../helpers/Factory';
import { permitSignature } from '../helpers/Permit';
import { shouldHaveGap } from '../helpers/Proxy';
import { latest } from '../helpers/Time';
import { toDecimal, toWei } from '../helpers/Types';
import {
    createTokenBySymbol,
    createWallet,
    errorMessageTokenExceedsAllowance,
    getBalance,
    getTransactionGas,
    getTransactionCost,
    transfer,
    TokenWithAddress
} from '../helpers/Utils';
import { TokenGovernance } from '@bancor/token-governance';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import Decimal from 'decimal.js';
import { BigNumber, ContractTransaction, Signer, utils, Wallet } from 'ethers';
import fs from 'fs';
import { ethers, waffle } from 'hardhat';
import { camelCase } from 'lodash';
import { Context } from 'mocha';
import path from 'path';
import prompt from 'prompt';

const { Upgradeable: UpgradeableRoles } = roles;
const { solidityKeccak256, formatBytes32String } = utils;

describe('Profile', () => {
    prompt.start();

    let deployer: SignerWithAddress;
    let nonOwner: SignerWithAddress;
    let newOwner: SignerWithAddress;

    const INITIAL_RATE = { n: BigNumber.from(1), d: BigNumber.from(2) };

    shouldHaveGap('BancorNetwork', '_externalProtectionWallet');

    before(async () => {
        [deployer, nonOwner, newOwner] = await ethers.getSigners();
    });

    const profile = async (msg: string, tx: Promise<ContractTransaction>) => {
        const { DEBUG: debug } = process.env;

        if (debug) {
            await prompt.get([`[${msg}]`]);
        }

        const res = await tx;

        const gas = await getTransactionGas(res);
        console.log(`[${msg}]: ${gas}`);

        if (debug) {
            console.log(`   ${(await res.wait()).transactionHash}`);
        }

        return res;
    };

    const networkPermitSignature = async (
        sender: Wallet,
        tokenAddress: string,
        network: TestBancorNetwork,
        amount: BigNumber,
        deadline: BigNumber
    ) => {
        if (
            tokenAddress === NATIVE_TOKEN_ADDRESS ||
            tokenAddress === ZERO_ADDRESS ||
            tokenAddress === (await network.networkToken())
        ) {
            return {
                v: BigNumber.from(0),
                r: formatBytes32String(''),
                s: formatBytes32String('')
            };
        }

        const reserveToken = await Contracts.TestERC20Token.attach(tokenAddress);
        const senderAddress = await sender.getAddress();

        const nonce = await reserveToken.nonces(senderAddress);

        return permitSignature(
            sender,
            await reserveToken.name(),
            reserveToken.address,
            network.address,
            amount,
            nonce,
            deadline
        );
    };

    const specToString = (spec: PoolSpec) => {
        if (spec.tradingFeePPM !== undefined) {
            return `${spec.symbol} (balance=${spec.balance}, fee=${feeToString(spec.tradingFeePPM)})`;
        }

        return `${spec.symbol} (balance=${spec.balance})`;
    };

    const initWithdraw = async (
        provider: SignerWithAddress,
        pendingWithdrawals: TestPendingWithdrawals,
        poolToken: PoolToken,
        amount: BigNumber
    ) => {
        await poolToken.connect(provider).approve(pendingWithdrawals.address, amount);
        await pendingWithdrawals.connect(provider).initWithdrawal(poolToken.address, amount);

        const withdrawalRequestIds = await pendingWithdrawals.withdrawalRequestIds(provider.address);
        const id = withdrawalRequestIds[withdrawalRequestIds.length - 1];
        const withdrawalRequest = await pendingWithdrawals.withdrawalRequest(id);
        const creationTime = withdrawalRequest.createdAt;

        return { id, creationTime };
    };

    const trade = async (
        trader: SignerWithAddress,
        sourceToken: TokenWithAddress,
        targetToken: TokenWithAddress,
        amount: BigNumber,
        minReturnAmount: BigNumber,
        deadline: BigNumber,
        beneficiary: string,
        network: TestBancorNetwork
    ) => {
        let value = BigNumber.from(0);
        if (sourceToken.address === NATIVE_TOKEN_ADDRESS) {
            value = amount;
        } else {
            const reserveToken = await Contracts.TestERC20Token.attach(sourceToken.address);

            await reserveToken.transfer(await trader.getAddress(), amount);
            await reserveToken.connect(trader).approve(network.address, amount);
        }

        return network
            .connect(trader)
            .trade(sourceToken.address, targetToken.address, amount, minReturnAmount, deadline, beneficiary, {
                value
            });
    };

    const feeToString = (feePPM: number) => `${toDecimal(feePPM).mul(100).div(toDecimal(PPM_RESOLUTION))}%`;

    describe('deposit', () => {
        let network: TestBancorNetwork;
        let networkSettings: NetworkSettings;
        let networkToken: NetworkToken;
        let govToken: GovToken;
        let networkTokenPool: TestNetworkTokenPool;
        let poolCollection: TestPoolCollection;
        let bancorVault: BancorVault;
        let pendingWithdrawals: TestPendingWithdrawals;
        let networkPoolToken: PoolToken;
        let externalProtectionWallet: TokenHolder;

        const MAX_DEVIATION = BigNumber.from(10_000); // %1
        const MINTING_LIMIT = toWei(BigNumber.from(10_000_000));
        const WITHDRAWAL_FEE = BigNumber.from(50_000); // 5%
        const MIN_LIQUIDITY_FOR_TRADING = toWei(BigNumber.from(100_000));
        const DEPOSIT_LIMIT = toWei(BigNumber.from(100_000_000));

        const setup = async () => {
            ({
                network,
                networkSettings,
                networkToken,
                govToken,
                networkTokenPool,
                poolCollection,
                bancorVault,
                pendingWithdrawals,
                networkPoolToken
            } = await createSystem());

            await networkSettings.setAverageRateMaxDeviationPPM(MAX_DEVIATION);
            await networkSettings.setWithdrawalFeePPM(WITHDRAWAL_FEE);
            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

            externalProtectionWallet = await createTokenHolder();
            await externalProtectionWallet.transferOwnership(network.address);
            await network.setExternalProtectionWallet(externalProtectionWallet.address);
        };

        beforeEach(async () => {
            await waffle.loadFixture(setup);
        });

        const testDeposits = (symbol: string) => {
            const isNetworkToken = symbol === BNT;
            const isETH = symbol === ETH;

            let poolToken: PoolToken;
            let token: TokenWithAddress;

            beforeEach(async () => {
                if (isNetworkToken) {
                    token = networkToken;
                } else {
                    token = await createTokenBySymbol(symbol);
                }

                if (isNetworkToken) {
                    poolToken = networkPoolToken;
                } else {
                    poolToken = await createPool(token, network, networkSettings, poolCollection);

                    await networkSettings.setPoolMintingLimit(token.address, MINTING_LIMIT);

                    await poolCollection.setDepositLimit(token.address, DEPOSIT_LIMIT);
                    await poolCollection.setInitialRate(token.address, INITIAL_RATE);
                }

                await setTime((await latest()).toNumber());
            });

            const setTime = async (time: number) => {
                await network.setTime(time);
                await pendingWithdrawals.setTime(time);
            };

            const verifyDeposit = async (
                provider: Signer | Wallet,
                sender: Signer | Wallet,
                amount: BigNumber,
                deposit: (amount: BigNumber) => Promise<ContractTransaction>
            ) => {
                const providerAddress = await provider.getAddress();
                const senderAddress = await sender.getAddress();

                const contextId = solidityKeccak256(
                    ['address', 'uint32', 'address', 'address', 'uint256'],
                    [senderAddress, await network.currentTime(), providerAddress, token.address, amount]
                );

                const prevPoolTokenTotalSupply = await poolToken.totalSupply();
                const prevProviderPoolTokenBalance = await poolToken.balanceOf(providerAddress);

                const prevProviderTokenBalance = await getBalance(token, providerAddress);
                const prevSenderTokenBalance = await getBalance(token, senderAddress);
                const prevVaultTokenBalance = await getBalance(token, bancorVault.address);

                const prevNetworkTokenTotalSupply = await networkToken.totalSupply();
                const prevVaultNetworkTokenBalance = await networkToken.balanceOf(bancorVault.address);

                const prevGovTotalSupply = await govToken.totalSupply();
                const prevProviderGovTokenBalance = await govToken.balanceOf(providerAddress);
                const prevSenderGovTokenBalance = await govToken.balanceOf(senderAddress);

                let expectedPoolTokenAmount;
                let transactionCost = BigNumber.from(0);

                if (isNetworkToken) {
                    expectedPoolTokenAmount = amount
                        .mul(await poolToken.totalSupply())
                        .div(await networkTokenPool.stakedBalance());

                    const res = await profile(`deposit ${symbol}`, deposit(amount));

                    await expect(res)
                        .to.emit(network, 'NetworkTokenDeposited')
                        .withArgs(contextId, providerAddress, amount, expectedPoolTokenAmount, expectedPoolTokenAmount);

                    await expect(res)
                        .to.emit(network, 'TotalLiquidityUpdated')
                        .withArgs(
                            contextId,
                            token.address,
                            await poolToken.totalSupply(),
                            await networkTokenPool.stakedBalance(),
                            await getBalance(token, bancorVault.address)
                        );

                    expect(await poolToken.totalSupply()).to.equal(prevPoolTokenTotalSupply);

                    expect(await getBalance(token, bancorVault.address)).to.equal(prevVaultTokenBalance);

                    expect(await networkToken.totalSupply()).to.equal(prevNetworkTokenTotalSupply.sub(amount));

                    expect(await govToken.totalSupply()).to.equal(prevGovTotalSupply.add(expectedPoolTokenAmount));
                    expect(await govToken.balanceOf(providerAddress)).to.equal(
                        prevProviderGovTokenBalance.add(expectedPoolTokenAmount)
                    );
                } else {
                    const prevPoolLiquidity = await poolCollection.poolLiquidity(token.address);

                    if (prevPoolTokenTotalSupply.isZero()) {
                        expectedPoolTokenAmount = amount;
                    } else {
                        expectedPoolTokenAmount = amount
                            .mul(prevPoolTokenTotalSupply)
                            .div(prevPoolLiquidity.stakedBalance);
                    }

                    const res = await profile(`deposit ${symbol}`, deposit(amount));

                    if (isETH) {
                        transactionCost = await getTransactionCost(res);
                    }

                    await expect(res)
                        .to.emit(network, 'BaseTokenDeposited')
                        .withArgs(
                            contextId,
                            token.address,
                            providerAddress,
                            poolCollection.address,
                            amount,
                            expectedPoolTokenAmount
                        );

                    const poolLiquidity = await poolCollection.poolLiquidity(token.address);

                    await expect(res)
                        .to.emit(network, 'TotalLiquidityUpdated')
                        .withArgs(
                            contextId,
                            token.address,
                            await poolToken.totalSupply(),
                            poolLiquidity.stakedBalance,
                            await getBalance(token, bancorVault.address)
                        );

                    await expect(res)
                        .to.emit(network, 'TotalLiquidityUpdated')
                        .withArgs(
                            contextId,
                            networkToken.address,
                            await networkPoolToken.totalSupply(),
                            await networkTokenPool.stakedBalance(),
                            await networkToken.balanceOf(bancorVault.address)
                        );

                    await expect(res)
                        .to.emit(network, 'TradingLiquidityUpdated')
                        .withArgs(contextId, token.address, token.address, poolLiquidity.baseTokenTradingLiquidity);

                    await expect(res)
                        .to.emit(network, 'TradingLiquidityUpdated')
                        .withArgs(
                            contextId,
                            token.address,
                            networkToken.address,
                            poolLiquidity.networkTokenTradingLiquidity
                        );

                    expect(await poolToken.totalSupply()).to.equal(
                        prevPoolTokenTotalSupply.add(expectedPoolTokenAmount)
                    );

                    expect(await getBalance(token, bancorVault.address)).to.equal(prevVaultTokenBalance.add(amount));

                    // expect a few network tokens to be minted to the vault
                    expect(await networkToken.totalSupply()).to.be.gte(prevNetworkTokenTotalSupply);
                    expect(await networkToken.balanceOf(bancorVault.address)).to.be.gte(prevVaultNetworkTokenBalance);

                    expect(await govToken.totalSupply()).to.equal(prevGovTotalSupply);
                    expect(await govToken.balanceOf(providerAddress)).to.equal(prevProviderGovTokenBalance);
                }

                expect(await poolToken.balanceOf(providerAddress)).to.equal(
                    prevProviderPoolTokenBalance.add(expectedPoolTokenAmount)
                );

                if (provider !== sender) {
                    expect(await getBalance(token, providerAddress)).to.equal(prevProviderTokenBalance);

                    expect(await govToken.balanceOf(senderAddress)).to.equal(prevSenderGovTokenBalance);
                }

                expect(await getBalance(token, senderAddress)).to.equal(
                    prevSenderTokenBalance.sub(amount).sub(transactionCost)
                );
            };

            const testDeposit = () => {
                context('regular deposit', () => {
                    enum Method {
                        Deposit,
                        DepositFor
                    }

                    let provider: SignerWithAddress;

                    before(async () => {
                        [, provider] = await ethers.getSigners();
                    });

                    it('should revert when attempting to deposit for an invalid provider', async () => {
                        await expect(
                            network.depositFor(ZERO_ADDRESS, token.address, BigNumber.from(1))
                        ).to.be.revertedWith('InvalidAddress');
                    });

                    for (const method of [Method.Deposit, Method.DepositFor]) {
                        context(`using ${camelCase(Method[method])} method`, () => {
                            let sender: SignerWithAddress;

                            before(async () => {
                                switch (method) {
                                    case Method.Deposit:
                                        sender = provider;

                                        break;

                                    case Method.DepositFor:
                                        sender = deployer;

                                        break;
                                }
                            });

                            interface Overrides {
                                value?: BigNumber;
                                poolAddress?: string;
                            }

                            const deposit = async (amount: BigNumber, overrides: Overrides = {}) => {
                                let { value, poolAddress = token.address } = overrides;

                                if (!value) {
                                    value = BigNumber.from(0);
                                    if (isETH) {
                                        value = amount;
                                    }
                                }

                                switch (method) {
                                    case Method.Deposit:
                                        return network.connect(sender).deposit(poolAddress, amount, { value });

                                    case Method.DepositFor:
                                        return network
                                            .connect(sender)
                                            .depositFor(provider.address, poolAddress, amount, { value });
                                }
                            };

                            it('should revert when attempting to deposit an invalid amount', async () => {
                                await expect(deposit(BigNumber.from(0))).to.be.revertedWith('ZeroValue');
                            });

                            it('should revert when attempting to deposit to an invalid pool', async () => {
                                await expect(
                                    deposit(BigNumber.from(1), { poolAddress: ZERO_ADDRESS })
                                ).to.be.revertedWith('InvalidAddress');
                            });

                            it('should revert when attempting to deposit into a pool that does not exist', async () => {
                                token = await createTokenBySymbol(TKN);

                                await expect(deposit(BigNumber.from(1))).to.be.revertedWith('InvalidToken');
                            });

                            const testDepositAmount = async (amount: BigNumber) => {
                                const test = async () => verifyDeposit(provider, sender, amount, deposit);

                                context(`${amount} tokens`, () => {
                                    if (!isETH) {
                                        beforeEach(async () => {
                                            const reserveToken = await Contracts.TestERC20Token.attach(token.address);
                                            await reserveToken.transfer(sender.address, amount);
                                        });

                                        it('should revert when attempting to deposit without approving the network', async () => {
                                            await expect(deposit(amount)).to.be.revertedWith(
                                                errorMessageTokenExceedsAllowance(symbol)
                                            );
                                        });
                                    }

                                    context('with an approval', () => {
                                        if (!isETH) {
                                            beforeEach(async () => {
                                                const reserveToken = await Contracts.TestERC20Token.attach(
                                                    token.address
                                                );
                                                await reserveToken.connect(sender).approve(network.address, amount);
                                            });
                                        }

                                        if (isNetworkToken) {
                                            context('with requested liquidity', () => {
                                                beforeEach(async () => {
                                                    const contextId = formatBytes32String('CTX');

                                                    const reserveToken = await createTokenBySymbol(TKN);

                                                    await createPool(
                                                        reserveToken,
                                                        network,
                                                        networkSettings,
                                                        poolCollection
                                                    );
                                                    await networkSettings.setPoolMintingLimit(
                                                        reserveToken.address,
                                                        MINTING_LIMIT
                                                    );

                                                    await network.requestLiquidityT(
                                                        contextId,
                                                        reserveToken.address,
                                                        amount
                                                    );
                                                });

                                                it.only('should complete a deposit', async () => {
                                                    await test();
                                                });
                                            });
                                        } else {
                                            context('when there is no unallocated network token liquidity', () => {
                                                beforeEach(async () => {
                                                    await networkSettings.setPoolMintingLimit(
                                                        token.address,
                                                        BigNumber.from(0)
                                                    );
                                                });

                                                context('with a whitelisted token', async () => {
                                                    it.only('should complete a deposit', async () => {
                                                        await test();
                                                    });
                                                });

                                                context('with non-whitelisted token', async () => {
                                                    beforeEach(async () => {
                                                        await networkSettings.removeTokenFromWhitelist(token.address);
                                                    });

                                                    it('should revert when attempting to deposit', async () => {
                                                        const amount = BigNumber.from(1000);

                                                        await expect(deposit(amount)).to.be.revertedWith(
                                                            'NotWhitelisted'
                                                        );
                                                    });
                                                });
                                            });

                                            context('when there is enough unallocated network token liquidity', () => {
                                                beforeEach(async () => {
                                                    await networkSettings.setPoolMintingLimit(
                                                        token.address,
                                                        MAX_UINT256
                                                    );
                                                });

                                                context('with non-whitelisted token', async () => {
                                                    beforeEach(async () => {
                                                        await networkSettings.removeTokenFromWhitelist(token.address);
                                                    });

                                                    it('should revert when attempting to deposit', async () => {
                                                        const amount = BigNumber.from(1000);

                                                        await expect(deposit(amount)).to.be.revertedWith(
                                                            'NetworkLiquidityDisabled'
                                                        );
                                                    });
                                                });

                                                context('when spot rate is unstable', () => {
                                                    beforeEach(async () => {
                                                        const spotRate = {
                                                            n: toWei(BigNumber.from(1_000_000)),
                                                            d: toWei(BigNumber.from(10_000_000))
                                                        };

                                                        const { stakedBalance } = await poolCollection.poolLiquidity(
                                                            token.address
                                                        );
                                                        await poolCollection.setTradingLiquidityT(token.address, {
                                                            networkTokenTradingLiquidity: spotRate.n,
                                                            baseTokenTradingLiquidity: spotRate.d,
                                                            tradingLiquidityProduct: spotRate.n.mul(spotRate.d),
                                                            stakedBalance
                                                        });
                                                        await poolCollection.setAverageRateT(token.address, {
                                                            rate: {
                                                                n: spotRate.n.mul(PPM_RESOLUTION),
                                                                d: spotRate.d.mul(
                                                                    PPM_RESOLUTION.add(
                                                                        MAX_DEVIATION.add(BigNumber.from(5000))
                                                                    )
                                                                )
                                                            },
                                                            time: BigNumber.from(0)
                                                        });

                                                        it('should revert when attempting to deposit', async () => {
                                                            const amount = BigNumber.from(1000);

                                                            await expect(deposit(amount)).to.be.revertedWith(
                                                                'NetworkLiquidityDisabled'
                                                            );
                                                        });
                                                    });
                                                });

                                                context('when spot rate is stable', () => {
                                                    if (isETH) {
                                                        // eslint-disable-next-line max-len
                                                        it('should revert when attempting to deposit a different amount than what was actually sent', async () => {
                                                            await expect(
                                                                deposit(amount, {
                                                                    value: amount.add(BigNumber.from(1))
                                                                })
                                                            ).to.be.revertedWith('EthAmountMismatch');

                                                            await expect(
                                                                deposit(amount, {
                                                                    value: amount.sub(BigNumber.from(1))
                                                                })
                                                            ).to.be.revertedWith('EthAmountMismatch');

                                                            await expect(
                                                                deposit(amount, { value: BigNumber.from(0) })
                                                            ).to.be.revertedWith('InvalidPool');
                                                        });
                                                    } else {
                                                        it('should revert when attempting to deposit ETH into a non ETH pool', async () => {
                                                            await expect(
                                                                deposit(amount, { value: BigNumber.from(1) })
                                                            ).to.be.revertedWith('InvalidPool');
                                                        });
                                                    }

                                                    it.only('should complete a deposit', async () => {
                                                        await test();
                                                    });

                                                    context(
                                                        'when close to the limit of the unallocated network token liquidity',
                                                        () => {
                                                            beforeEach(async () => {
                                                                await networkSettings.setPoolMintingLimit(
                                                                    token.address,
                                                                    BigNumber.from(1000)
                                                                );
                                                            });

                                                            it.only('should complete a deposit', async () => {
                                                                await test();
                                                            });
                                                        }
                                                    );
                                                });
                                            });
                                        }
                                    });
                                });
                            };

                            for (const amount of [
                                BigNumber.from(10),
                                BigNumber.from(10_000),
                                toWei(BigNumber.from(1_000_000))
                            ]) {
                                testDepositAmount(amount);
                            }
                        });
                    }
                });
            };

            const testDepositPermitted = () => {
                context('permitted deposit', () => {
                    enum Method {
                        DepositPermitted,
                        DepositForPermitted
                    }

                    const DEADLINE = MAX_UINT256;

                    let provider: Wallet;
                    let providerAddress: string;

                    beforeEach(async () => {
                        provider = await createWallet();
                        providerAddress = await provider.getAddress();
                    });

                    it('should revert when attempting to deposit for an invalid provider', async () => {
                        const amount = BigNumber.from(1);
                        const { v, r, s } = await networkPermitSignature(
                            provider,
                            token.address,
                            network,
                            amount,
                            DEADLINE
                        );

                        await expect(
                            network.depositForPermitted(ZERO_ADDRESS, token.address, amount, DEADLINE, v, r, s)
                        ).to.be.revertedWith('InvalidAddress');
                    });

                    for (const method of [Method.DepositPermitted, Method.DepositForPermitted]) {
                        context(`using ${camelCase(Method[method])} method`, () => {
                            let sender: Wallet;
                            let senderAddress: string;

                            beforeEach(async () => {
                                switch (method) {
                                    case Method.DepositPermitted:
                                        sender = provider;

                                        break;

                                    case Method.DepositForPermitted:
                                        sender = await createWallet();

                                        break;
                                }

                                senderAddress = await sender.getAddress();
                            });

                            interface Overrides {
                                poolAddress?: string;
                            }

                            const deposit = async (amount: BigNumber, overrides: Overrides = {}) => {
                                const { poolAddress = token.address } = overrides;

                                const { v, r, s } = await networkPermitSignature(
                                    sender,
                                    poolAddress,
                                    network,
                                    amount,
                                    DEADLINE
                                );

                                switch (method) {
                                    case Method.DepositPermitted:
                                        return network
                                            .connect(sender)
                                            .depositPermitted(poolAddress, amount, DEADLINE, v, r, s);

                                    case Method.DepositForPermitted:
                                        return network
                                            .connect(sender)
                                            .depositForPermitted(
                                                providerAddress,
                                                poolAddress,
                                                amount,
                                                DEADLINE,
                                                v,
                                                r,
                                                s
                                            );
                                }
                            };

                            it('should revert when attempting to deposit an invalid amount', async () => {
                                await expect(deposit(BigNumber.from(0))).to.be.revertedWith('ZeroValue');
                            });

                            it('should revert when attempting to deposit to an invalid pool', async () => {
                                await expect(
                                    deposit(BigNumber.from(1), { poolAddress: ZERO_ADDRESS })
                                ).to.be.revertedWith('InvalidAddress');
                            });

                            it('should revert when attempting to deposit into a pool that does not exist', async () => {
                                const token2 = await createTokenBySymbol(TKN);

                                await expect(
                                    deposit(BigNumber.from(1), {
                                        poolAddress: token2.address
                                    })
                                ).to.be.revertedWith('InvalidToken');
                            });

                            const testDepositAmount = async (amount: BigNumber) => {
                                const test = async () => verifyDeposit(provider, sender, amount, deposit);

                                context(`${amount} tokens`, () => {
                                    if (isNetworkToken || isETH) {
                                        it('should revert when attempting to deposit', async () => {
                                            await expect(deposit(amount)).to.be.revertedWith('PermitUnsupported');
                                        });

                                        return;
                                    }

                                    beforeEach(async () => {
                                        const reserveToken = await Contracts.TestERC20Token.attach(token.address);
                                        await reserveToken.transfer(senderAddress, amount);
                                    });

                                    context('when there is no unallocated network token liquidity', () => {
                                        beforeEach(async () => {
                                            await networkSettings.setPoolMintingLimit(token.address, BigNumber.from(0));
                                        });

                                        context('with a whitelisted token', async () => {
                                            it.only('should complete a deposit', async () => {
                                                await test();
                                            });
                                        });

                                        context('with non-whitelisted token', async () => {
                                            beforeEach(async () => {
                                                await networkSettings.removeTokenFromWhitelist(token.address);
                                            });

                                            it('should revert when attempting to deposit', async () => {
                                                const amount = BigNumber.from(1000);

                                                await expect(deposit(amount)).to.be.revertedWith('NotWhitelisted');
                                            });
                                        });
                                    });

                                    context('when there is enough unallocated network token liquidity', () => {
                                        beforeEach(async () => {
                                            await networkSettings.setPoolMintingLimit(token.address, MAX_UINT256);
                                        });

                                        context('with non-whitelisted token', async () => {
                                            beforeEach(async () => {
                                                await networkSettings.removeTokenFromWhitelist(token.address);
                                            });

                                            it('should revert when attempting to deposit', async () => {
                                                const amount = BigNumber.from(1000);

                                                await expect(deposit(amount)).to.be.revertedWith(
                                                    'NetworkLiquidityDisabled'
                                                );
                                            });
                                        });

                                        context('when spot rate is unstable', () => {
                                            beforeEach(async () => {
                                                const spotRate = {
                                                    n: toWei(BigNumber.from(1_000_000)),
                                                    d: toWei(BigNumber.from(10_000_000))
                                                };

                                                const { stakedBalance } = await poolCollection.poolLiquidity(
                                                    token.address
                                                );
                                                await poolCollection.setTradingLiquidityT(token.address, {
                                                    networkTokenTradingLiquidity: spotRate.n,
                                                    baseTokenTradingLiquidity: spotRate.d,
                                                    tradingLiquidityProduct: spotRate.n.mul(spotRate.d),
                                                    stakedBalance
                                                });
                                                await poolCollection.setAverageRateT(token.address, {
                                                    rate: {
                                                        n: spotRate.n.mul(PPM_RESOLUTION),
                                                        d: spotRate.d.mul(
                                                            PPM_RESOLUTION.add(MAX_DEVIATION.add(BigNumber.from(5000)))
                                                        )
                                                    },
                                                    time: BigNumber.from(0)
                                                });

                                                it('should revert when attempting to deposit', async () => {
                                                    const amount = BigNumber.from(1000);

                                                    await expect(deposit(amount)).to.be.revertedWith(
                                                        'NetworkLiquidityDisabled'
                                                    );
                                                });
                                            });
                                        });

                                        context('when spot rate is stable', () => {
                                            it.only('should complete a deposit', async () => {
                                                await test();
                                            });

                                            context(
                                                'when close to the limit of the unallocated network token liquidity',
                                                () => {
                                                    beforeEach(async () => {
                                                        await networkSettings.setPoolMintingLimit(
                                                            token.address,
                                                            BigNumber.from(1000)
                                                        );
                                                    });

                                                    it.only('should complete a deposit', async () => {
                                                        await test();
                                                    });
                                                }
                                            );
                                        });
                                    });
                                });
                            };

                            for (const amount of [
                                BigNumber.from(10),
                                BigNumber.from(10_000),
                                toWei(BigNumber.from(1_000_000))
                            ]) {
                                testDepositAmount(amount);
                            }
                        });
                    }
                });
            };

            testDeposit();
            testDepositPermitted();
        };

        for (const symbol of [BNT, ETH, TKN]) {
            context(symbol, () => {
                testDeposits(symbol);
            });
        }
    });

    describe('withdraw', () => {
        let network: TestBancorNetwork;
        let networkSettings: NetworkSettings;
        let networkToken: NetworkToken;
        let govToken: GovToken;
        let networkTokenPool: TestNetworkTokenPool;
        let poolCollection: TestPoolCollection;
        let bancorVault: BancorVault;
        let pendingWithdrawals: TestPendingWithdrawals;
        let networkPoolToken: PoolToken;
        let externalProtectionWallet: TokenHolder;

        const MAX_DEVIATION = BigNumber.from(10_000); // %1
        const MINTING_LIMIT = toWei(BigNumber.from(10_000_000));
        const WITHDRAWAL_FEE = BigNumber.from(50_000); // 5%
        const MIN_LIQUIDITY_FOR_TRADING = toWei(BigNumber.from(100_000));

        const setTime = async (time: number) => {
            await network.setTime(time);
            await pendingWithdrawals.setTime(time);
        };

        const setup = async () => {
            ({
                network,
                networkSettings,
                networkToken,
                govToken,
                networkTokenPool,
                poolCollection,
                bancorVault,
                pendingWithdrawals,
                networkPoolToken
            } = await createSystem());

            await networkSettings.setAverageRateMaxDeviationPPM(MAX_DEVIATION);
            await networkSettings.setWithdrawalFeePPM(WITHDRAWAL_FEE);
            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

            externalProtectionWallet = await createTokenHolder();
            await externalProtectionWallet.transferOwnership(network.address);
            await network.setExternalProtectionWallet(externalProtectionWallet.address);

            await setTime((await latest()).toNumber());
        };

        beforeEach(async () => {
            await waffle.loadFixture(setup);
        });

        it('should revert when attempting to withdraw a non-existing withdrawal request', async () => {
            await expect(network.withdraw(BigNumber.from(12345))).to.be.revertedWith('AccessDenied');
        });

        const testWithdraw = async (symbol: string) => {
            const isNetworkToken = symbol === BNT;
            const isETH = symbol === ETH;

            context('with an initiated withdrawal request', () => {
                let provider: SignerWithAddress;
                let poolToken: PoolToken;
                let token: TokenWithAddress;
                let poolTokenAmount: BigNumber;
                let id: BigNumber;
                let creationTime: number;

                before(async () => {
                    [, provider] = await ethers.getSigners();
                });

                beforeEach(async () => {
                    if (isNetworkToken) {
                        token = networkToken;
                    } else {
                        token = await createTokenBySymbol(symbol);
                    }

                    // create a deposit
                    const amount = toWei(BigNumber.from(222_222_222));

                    if (isNetworkToken) {
                        poolToken = networkPoolToken;

                        const contextId = formatBytes32String('CTX');
                        const reserveToken = await createTokenBySymbol(TKN);
                        await networkSettings.setPoolMintingLimit(reserveToken.address, MAX_UINT256);

                        await network.requestLiquidityT(contextId, reserveToken.address, amount);
                    } else {
                        poolToken = await createPool(token, network, networkSettings, poolCollection);

                        await networkSettings.setPoolMintingLimit(token.address, MINTING_LIMIT);

                        await poolCollection.setDepositLimit(token.address, MAX_UINT256);
                        await poolCollection.setInitialRate(token.address, INITIAL_RATE);
                    }

                    await depositToPool(provider, token, amount, network);

                    poolTokenAmount = await poolToken.balanceOf(provider.address);

                    ({ id, creationTime } = await initWithdraw(
                        provider,
                        pendingWithdrawals,
                        poolToken,
                        await poolToken.balanceOf(provider.address)
                    ));
                });

                it('should revert when attempting to withdraw from a different provider', async () => {
                    await expect(network.connect(deployer).withdraw(id)).to.be.revertedWith('AccessDenied');
                });

                context('during the lock duration', () => {
                    beforeEach(async () => {
                        await setTime(creationTime + 1000);
                    });

                    it('should revert when attempting to withdraw', async () => {
                        await expect(network.connect(provider).withdraw(id)).to.be.revertedWith('WithdrawalNotAllowed');
                    });

                    context('after the withdrawal window duration', () => {
                        beforeEach(async () => {
                            const withdrawalDuration =
                                (await pendingWithdrawals.lockDuration()) +
                                (await pendingWithdrawals.withdrawalWindowDuration());
                            await setTime(creationTime + withdrawalDuration + 1);
                        });

                        it('should revert when attempting to withdraw', async () => {
                            await expect(network.connect(provider).withdraw(id)).to.be.revertedWith(
                                'WithdrawalNotAllowed'
                            );
                        });
                    });

                    context('during the withdrawal window duration', () => {
                        beforeEach(async () => {
                            const withdrawalDuration =
                                (await pendingWithdrawals.lockDuration()) +
                                (await pendingWithdrawals.withdrawalWindowDuration());
                            await setTime(creationTime + withdrawalDuration - 1);
                        });

                        if (isNetworkToken) {
                            it('should revert when attempting to withdraw without approving the governance token amount', async () => {
                                await expect(network.connect(provider).withdraw(id)).to.be.revertedWith(
                                    'ERR_UNDERFLOW'
                                );
                            });

                            it('should revert when attempting to withdraw with an insufficient governance token amount', async () => {
                                await govToken.connect(provider).transfer(deployer.address, BigNumber.from(1));
                                await govToken.connect(provider).approve(network.address, poolTokenAmount);

                                await expect(network.connect(provider).withdraw(id)).to.be.revertedWith(
                                    'ERR_UNDERFLOW'
                                );
                            });
                        }

                        context('with approvals', () => {
                            let contextId: string;

                            beforeEach(async () => {
                                contextId = solidityKeccak256(
                                    ['address', 'uint32', 'uint256'],
                                    [provider.address, await network.currentTime(), id]
                                );

                                if (isNetworkToken) {
                                    await govToken.connect(provider).approve(network.address, poolTokenAmount);
                                }
                            });

                            const test = async () => {
                                const prevPoolTokenTotalSupply = await poolToken.totalSupply();
                                const prevPoolPoolTokenBalance = await poolToken.balanceOf(networkTokenPool.address);
                                const prevCollectionPoolTokenBalance = await poolToken.balanceOf(
                                    poolCollection.address
                                );
                                const prevProviderPoolTokenBalance = await poolToken.balanceOf(provider.address);

                                const prevProviderTokenBalance = await getBalance(token, provider.address);

                                const prevGovTotalSupply = await govToken.totalSupply();
                                const prevPoolGovTokenBalance = await govToken.balanceOf(networkTokenPool.address);
                                const prevProviderGovTokenBalance = await govToken.balanceOf(provider.address);

                                let transactionCost = BigNumber.from(0);

                                if (isNetworkToken) {
                                    const withdrawalAmounts = await networkTokenPool.withdrawalAmountsT(
                                        poolTokenAmount
                                    );

                                    const res = await profile(
                                        `withdraw ${symbol}`,
                                        network.connect(provider).withdraw(id)
                                    );

                                    await expect(res)
                                        .to.emit(network, 'NetworkTokenWithdrawn')
                                        .withArgs(
                                            contextId,
                                            provider.address,
                                            withdrawalAmounts.networkTokenAmount,
                                            poolTokenAmount,
                                            poolTokenAmount,
                                            withdrawalAmounts.withdrawalFeeAmount
                                        );

                                    await expect(res)
                                        .to.emit(network, 'TotalLiquidityUpdated')
                                        .withArgs(
                                            contextId,
                                            token.address,
                                            await poolToken.totalSupply(),
                                            await networkTokenPool.stakedBalance(),
                                            await getBalance(token, bancorVault.address)
                                        );

                                    expect(await poolToken.totalSupply()).to.equal(prevPoolTokenTotalSupply);
                                    expect(await poolToken.balanceOf(networkTokenPool.address)).to.equal(
                                        prevPoolPoolTokenBalance.add(poolTokenAmount)
                                    );

                                    expect(await govToken.totalSupply()).to.equal(
                                        prevGovTotalSupply.sub(poolTokenAmount)
                                    );

                                    expect(await govToken.balanceOf(provider.address)).to.equal(
                                        prevProviderGovTokenBalance.sub(poolTokenAmount)
                                    );
                                } else {
                                    const withdrawalAmounts = await poolCollection.poolWithdrawalAmountsT(
                                        token.address,
                                        poolTokenAmount,
                                        await getBalance(token, bancorVault.address),
                                        await getBalance(token, externalProtectionWallet.address)
                                    );

                                    const res = await profile(
                                        `withdraw ${symbol}`,
                                        network.connect(provider).withdraw(id)
                                    );

                                    if (isETH) {
                                        transactionCost = await getTransactionCost(res);
                                    }

                                    await expect(res)
                                        .to.emit(network, 'BaseTokenWithdrawn')
                                        .withArgs(
                                            contextId,
                                            token.address,
                                            provider.address,
                                            poolCollection.address,
                                            withdrawalAmounts.baseTokenAmountToTransferFromVaultToProvider.add(
                                                withdrawalAmounts.baseTokenAmountToTransferFromExternalProtectionWalletToProvider
                                            ),
                                            poolTokenAmount,
                                            withdrawalAmounts.baseTokenAmountToTransferFromExternalProtectionWalletToProvider,
                                            withdrawalAmounts.networkTokenAmountToMintForProvider,
                                            withdrawalAmounts.baseTokenWithdrawalFeeAmount
                                        );

                                    const poolLiquidity = await poolCollection.poolLiquidity(token.address);

                                    await expect(res)
                                        .to.emit(network, 'TotalLiquidityUpdated')
                                        .withArgs(
                                            contextId,
                                            token.address,
                                            await poolToken.totalSupply(),
                                            poolLiquidity.stakedBalance,
                                            await getBalance(token, bancorVault.address)
                                        );

                                    await expect(res)
                                        .to.emit(network, 'TradingLiquidityUpdated')
                                        .withArgs(
                                            contextId,
                                            token.address,
                                            token.address,
                                            poolLiquidity.baseTokenTradingLiquidity
                                        );

                                    await expect(res)
                                        .to.emit(network, 'TradingLiquidityUpdated')
                                        .withArgs(
                                            contextId,
                                            token.address,
                                            networkToken.address,
                                            poolLiquidity.networkTokenTradingLiquidity
                                        );

                                    expect(await poolToken.totalSupply()).to.equal(
                                        prevPoolTokenTotalSupply.sub(poolTokenAmount)
                                    );
                                    expect(await poolToken.balanceOf(networkTokenPool.address)).to.equal(
                                        prevPoolPoolTokenBalance
                                    );

                                    expect(await govToken.totalSupply()).to.equal(prevGovTotalSupply);
                                    expect(await govToken.balanceOf(provider.address)).to.equal(
                                        prevProviderGovTokenBalance
                                    );
                                }

                                expect(await poolToken.balanceOf(poolCollection.address)).to.equal(
                                    prevCollectionPoolTokenBalance
                                );
                                expect(await poolToken.balanceOf(provider.address)).to.equal(
                                    prevProviderPoolTokenBalance
                                );

                                expect(await govToken.balanceOf(networkTokenPool.address)).to.equal(
                                    prevPoolGovTokenBalance
                                );

                                // sanity test:
                                expect(await getBalance(token, provider.address)).to.be.gte(
                                    prevProviderTokenBalance.sub(transactionCost)
                                );

                                // TODO: test actual amounts
                                // TODO: test request/renounce liquidity
                                // TODO: test vault and external storage balances
                            };

                            if (isNetworkToken) {
                                it('should complete a withdraw', async () => {
                                    await test();
                                });
                            } else {
                                context('with non-whitelisted token', async () => {
                                    beforeEach(async () => {
                                        await networkSettings.removeTokenFromWhitelist(token.address);
                                    });

                                    it('should revert when attempting to withdraw', async () => {
                                        await expect(network.connect(provider).withdraw(id)).to.be.revertedWith(
                                            'NetworkLiquidityDisabled'
                                        );
                                    });
                                });

                                context('when spot rate is unstable', () => {
                                    beforeEach(async () => {
                                        const spotRate = {
                                            n: toWei(BigNumber.from(1_000_000)),
                                            d: toWei(BigNumber.from(10_000_000))
                                        };

                                        const { stakedBalance } = await poolCollection.poolLiquidity(token.address);
                                        await poolCollection.setTradingLiquidityT(token.address, {
                                            networkTokenTradingLiquidity: spotRate.n,
                                            baseTokenTradingLiquidity: spotRate.d,
                                            tradingLiquidityProduct: spotRate.n.mul(spotRate.d),
                                            stakedBalance
                                        });
                                        await poolCollection.setAverageRateT(token.address, {
                                            rate: {
                                                n: spotRate.n.mul(PPM_RESOLUTION),
                                                d: spotRate.d.mul(
                                                    PPM_RESOLUTION.add(MAX_DEVIATION.add(BigNumber.from(5000)))
                                                )
                                            },
                                            time: BigNumber.from(0)
                                        });
                                    });

                                    it('should revert when attempting to withdraw', async () => {
                                        await expect(network.connect(provider).withdraw(id)).to.be.revertedWith(
                                            'NetworkLiquidityDisabled'
                                        );
                                    });
                                });

                                context('when spot rate is stable', () => {
                                    it.only('should complete a withdraw', async () => {
                                        await test();
                                    });
                                });
                            }
                        });
                    });
                });
            });
        };

        for (const symbol of [BNT, ETH, TKN]) {
            context(symbol, () => {
                testWithdraw(symbol);
            });
        }
    });

    describe('trade', () => {
        let network: TestBancorNetwork;
        let networkSettings: NetworkSettings;
        let networkToken: NetworkToken;
        let networkTokenPool: TestNetworkTokenPool;
        let poolCollection: TestPoolCollection;
        let bancorVault: BancorVault;

        const MIN_LIQUIDITY_FOR_TRADING = toWei(BigNumber.from(100_000));
        const NETWORK_TOKEN_LIQUIDITY = toWei(BigNumber.from(100_000));
        const MIN_RETURN_AMOUNT = BigNumber.from(1);

        let sourceToken: TokenWithAddress;
        let targetToken: TokenWithAddress;

        let trader: Wallet;

        beforeEach(async () => {
            ({ network, networkSettings, networkToken, networkTokenPool, poolCollection, bancorVault } =
                await createSystem());

            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);
        });

        const setupPools = async (source: PoolSpec, target: PoolSpec) => {
            trader = await createWallet();

            ({ token: sourceToken } = await setupSimplePool(
                source,
                deployer,
                network,
                networkSettings,
                poolCollection
            ));

            ({ token: targetToken } = await setupSimplePool(
                target,
                deployer,
                network,
                networkSettings,
                poolCollection
            ));

            await depositToPool(deployer, networkToken, NETWORK_TOKEN_LIQUIDITY, network);

            await network.setTime(await latest());
        };

        interface TradeOverrides {
            value?: BigNumber;
            minReturnAmount?: BigNumber;
            deadline?: BigNumber;
            beneficiary?: string;
            sourceTokenAddress?: string;
            targetTokenAddress?: string;
        }

        const trade = async (amount: BigNumber, overrides: TradeOverrides = {}) => {
            let {
                value,
                minReturnAmount = MIN_RETURN_AMOUNT,
                deadline = MAX_UINT256,
                beneficiary = ZERO_ADDRESS,
                sourceTokenAddress = sourceToken.address,
                targetTokenAddress = targetToken.address
            } = overrides;

            if (!value) {
                value = BigNumber.from(0);
                if (sourceTokenAddress === NATIVE_TOKEN_ADDRESS) {
                    value = amount;
                }
            }

            return network
                .connect(trader)
                .trade(sourceTokenAddress, targetTokenAddress, amount, minReturnAmount, deadline, beneficiary, {
                    value
                });
        };

        interface TradePermittedOverrides {
            minReturnAmount?: BigNumber;
            deadline?: BigNumber;
            beneficiary?: string;
            sourceTokenAddress?: string;
            targetTokenAddress?: string;
            approvedAmount?: BigNumber;
        }

        const tradePermitted = async (amount: BigNumber, overrides: TradePermittedOverrides = {}) => {
            const {
                minReturnAmount = MIN_RETURN_AMOUNT,
                deadline = MAX_UINT256,
                beneficiary = ZERO_ADDRESS,
                sourceTokenAddress = sourceToken.address,
                targetTokenAddress = targetToken.address,
                approvedAmount = amount
            } = overrides;

            const { v, r, s } = await networkPermitSignature(
                trader,
                sourceTokenAddress,
                network,
                approvedAmount,
                deadline
            );

            return network
                .connect(trader)
                .tradePermitted(
                    sourceTokenAddress,
                    targetTokenAddress,
                    amount,
                    minReturnAmount,
                    deadline,
                    beneficiary,
                    v,
                    r,
                    s
                );
        };

        const verifyTrade = async (
            trader: Signer | Wallet,
            beneficiaryAddress: string,
            amount: BigNumber,
            trade: (
                amount: BigNumber,
                options: TradeOverrides | TradePermittedOverrides
            ) => Promise<ContractTransaction>
        ) => {
            const isSourceETH = sourceToken.address === NATIVE_TOKEN_ADDRESS;
            const isTargetETH = targetToken.address === NATIVE_TOKEN_ADDRESS;
            const isSourceNetworkToken = sourceToken.address === networkToken.address;
            const isTargetNetworkToken = targetToken.address === networkToken.address;

            const traderAddress = await trader.getAddress();
            const minReturnAmount = MIN_RETURN_AMOUNT;
            const deadline = MAX_UINT256;
            const beneficiary = beneficiaryAddress !== ZERO_ADDRESS ? beneficiaryAddress : traderAddress;

            const contextId = solidityKeccak256(
                ['address', 'uint32', 'address', 'address', 'uint256', 'uint256', 'uint256', 'address'],
                [
                    traderAddress,
                    await network.currentTime(),
                    sourceToken.address,
                    targetToken.address,
                    amount,
                    minReturnAmount,
                    deadline,
                    beneficiary
                ]
            );

            const prevTraderSourceTokenAmount = await getBalance(sourceToken, traderAddress);
            const prevVaultSourceTokenAmount = await getBalance(sourceToken, bancorVault.address);

            const prevBeneficiaryTargetTokenAmount = await getBalance(targetToken, beneficiary);
            const prevVaultTargetTokenAmount = await getBalance(targetToken, bancorVault.address);

            const prevTraderNetworkTokenAmount = await getBalance(networkToken, traderAddress);
            const prevBeneficiaryNetworkTokenAmount = await getBalance(networkToken, beneficiary);
            const prevVaultNetworkTokenAmount = await getBalance(networkToken, bancorVault.address);

            const prevNetworkTokenPoolStakedBalance = await networkTokenPool.stakedBalance();

            let sourceTradeAmounts!: AsyncReturnType<TestBancorNetwork['callStatic']['tradePoolCollectionT']>;
            let tradeAmounts;
            if (isSourceNetworkToken || isTargetNetworkToken) {
                tradeAmounts = await network.callStatic.tradePoolCollectionT(
                    poolCollection.address,
                    sourceToken.address,
                    targetToken.address,
                    amount,
                    MIN_RETURN_AMOUNT
                );
            } else {
                sourceTradeAmounts = await network.callStatic.tradePoolCollectionT(
                    poolCollection.address,
                    sourceToken.address,
                    networkToken.address,
                    amount,
                    MIN_RETURN_AMOUNT
                );

                tradeAmounts = await network.callStatic.tradePoolCollectionT(
                    poolCollection.address,
                    networkToken.address,
                    targetToken.address,
                    sourceTradeAmounts.amount,
                    MIN_RETURN_AMOUNT
                );
            }

            const targetAmount = await tradeTargetAmount(amount);
            expect(targetAmount).to.equal(tradeAmounts.amount);

            const sourceSymbol = isSourceNetworkToken ? BNT : isSourceETH ? ETH : TKN;
            const targetSymbol = isTargetNetworkToken ? BNT : isTargetETH ? ETH : TKN;
            const res = await profile(
                `trade ${sourceSymbol} --> ${targetSymbol}`,
                trade(amount, { minReturnAmount, beneficiary: beneficiaryAddress, deadline })
            );

            const transactionCost = await getTransactionCost(res);

            const networkTokenPoolStakedBalance = await networkTokenPool.stakedBalance();

            if (isSourceNetworkToken) {
                const poolLiquidity = await poolCollection.poolLiquidity(targetToken.address);

                await expect(res)
                    .to.emit(network, 'TokensTraded')
                    .withArgs(
                        contextId,
                        targetToken.address,
                        networkToken.address,
                        targetToken.address,
                        amount,
                        tradeAmounts.amount,
                        traderAddress
                    );

                await expect(res)
                    .to.emit(network, 'FeesCollected')
                    .withArgs(
                        contextId,
                        targetToken.address,
                        FeeTypes.Trading,
                        tradeAmounts.feeAmount,
                        poolLiquidity.stakedBalance
                    );

                await expect(res)
                    .to.emit(network, 'TradingLiquidityUpdated')
                    .withArgs(
                        contextId,
                        targetToken.address,
                        targetToken.address,
                        poolLiquidity.baseTokenTradingLiquidity
                    );

                await expect(res)
                    .to.emit(network, 'TradingLiquidityUpdated')
                    .withArgs(
                        contextId,
                        targetToken.address,
                        networkToken.address,
                        poolLiquidity.networkTokenTradingLiquidity
                    );
            } else if (isTargetNetworkToken) {
                const poolLiquidity = await poolCollection.poolLiquidity(sourceToken.address);

                await expect(res)
                    .to.emit(network, 'TokensTraded')
                    .withArgs(
                        contextId,
                        sourceToken.address,
                        sourceToken.address,
                        networkToken.address,
                        amount,
                        tradeAmounts.amount,
                        traderAddress
                    );

                await expect(res)
                    .to.emit(network, 'FeesCollected')
                    .withArgs(
                        contextId,
                        targetToken.address,
                        FeeTypes.Trading,
                        tradeAmounts.feeAmount,
                        networkTokenPoolStakedBalance
                    );

                await expect(res)
                    .to.emit(network, 'TradingLiquidityUpdated')
                    .withArgs(
                        contextId,
                        sourceToken.address,
                        sourceToken.address,
                        poolLiquidity.baseTokenTradingLiquidity
                    );

                await expect(res)
                    .to.emit(network, 'TradingLiquidityUpdated')
                    .withArgs(
                        contextId,
                        sourceToken.address,
                        networkToken.address,
                        poolLiquidity.networkTokenTradingLiquidity
                    );

                expect(networkTokenPoolStakedBalance).to.equal(
                    prevNetworkTokenPoolStakedBalance.add(tradeAmounts.feeAmount)
                );
            } else {
                const sourcePoolLiquidity = await poolCollection.poolLiquidity(sourceToken.address);
                const targetPoolLiquidity = await poolCollection.poolLiquidity(targetToken.address);

                await expect(res)
                    .to.emit(network, 'TokensTraded')
                    .withArgs(
                        contextId,
                        sourceToken.address,
                        sourceToken.address,
                        networkToken.address,
                        amount,
                        sourceTradeAmounts.amount,
                        traderAddress
                    );

                await expect(res)
                    .to.emit(network, 'FeesCollected')
                    .withArgs(
                        contextId,
                        networkToken.address,
                        FeeTypes.Trading,
                        sourceTradeAmounts.feeAmount,
                        networkTokenPoolStakedBalance
                    );

                await expect(res)
                    .to.emit(network, 'TradingLiquidityUpdated')
                    .withArgs(
                        contextId,
                        sourceToken.address,
                        sourceToken.address,
                        sourcePoolLiquidity.baseTokenTradingLiquidity
                    );

                await expect(res)
                    .to.emit(network, 'TradingLiquidityUpdated')
                    .withArgs(
                        contextId,
                        sourceToken.address,
                        networkToken.address,
                        sourcePoolLiquidity.networkTokenTradingLiquidity
                    );

                expect(networkTokenPoolStakedBalance).to.equal(
                    prevNetworkTokenPoolStakedBalance.add(sourceTradeAmounts.feeAmount)
                );

                await expect(res)
                    .to.emit(network, 'TokensTraded')
                    .withArgs(
                        contextId,
                        targetToken.address,
                        networkToken.address,
                        targetToken.address,
                        sourceTradeAmounts.amount,
                        tradeAmounts.amount,
                        traderAddress
                    );

                await expect(res)
                    .to.emit(network, 'FeesCollected')
                    .withArgs(
                        contextId,
                        targetToken.address,
                        FeeTypes.Trading,
                        tradeAmounts.feeAmount,
                        targetPoolLiquidity.stakedBalance
                    );

                await expect(res)
                    .to.emit(network, 'TradingLiquidityUpdated')
                    .withArgs(
                        contextId,
                        targetToken.address,
                        targetToken.address,
                        targetPoolLiquidity.baseTokenTradingLiquidity
                    );

                await expect(res)
                    .to.emit(network, 'TradingLiquidityUpdated')
                    .withArgs(
                        contextId,
                        targetToken.address,
                        networkToken.address,
                        targetPoolLiquidity.networkTokenTradingLiquidity
                    );
            }

            expect(await getBalance(sourceToken, traderAddress)).to.equal(
                prevTraderSourceTokenAmount.sub(amount.add(isSourceETH ? transactionCost : BigNumber.from(0)))
            );
            expect(await getBalance(sourceToken, bancorVault.address)).to.equal(prevVaultSourceTokenAmount.add(amount));

            expect(await getBalance(targetToken, beneficiary)).to.equal(
                prevBeneficiaryTargetTokenAmount.add(
                    targetAmount.sub(traderAddress === beneficiary && isTargetETH ? transactionCost : BigNumber.from(0))
                )
            );
            expect(await getBalance(targetToken, bancorVault.address)).to.equal(
                prevVaultTargetTokenAmount.sub(targetAmount)
            );

            // if neither the source or the target tokens are the network token - ensure that no network
            // token amount has left the system
            if (!isSourceNetworkToken && !isTargetNetworkToken) {
                expect(await getBalance(networkToken, traderAddress)).to.equal(prevTraderNetworkTokenAmount);
                expect(await getBalance(networkToken, beneficiary)).to.equal(prevBeneficiaryNetworkTokenAmount);
                expect(await getBalance(networkToken, bancorVault.address)).to.equal(prevVaultNetworkTokenAmount);
            }
        };

        interface TradeAmountsOverrides {
            sourceTokenAddress?: string;
            targetTokenAddress?: string;
        }
        const tradeTargetAmount = async (amount: BigNumber, overrides: TradeAmountsOverrides = {}) => {
            const { sourceTokenAddress = sourceToken.address, targetTokenAddress = targetToken.address } = overrides;

            return network.tradeTargetAmount(sourceTokenAddress, targetTokenAddress, amount);
        };

        const tradeSourceAmount = async (amount: BigNumber, overrides: TradeAmountsOverrides = {}) => {
            const { sourceTokenAddress = sourceToken.address, targetTokenAddress = targetToken.address } = overrides;

            return network.tradeSourceAmount(sourceTokenAddress, targetTokenAddress, amount);
        };

        const testTradesBasic = (source: PoolSpec, target: PoolSpec) => {
            const isSourceETH = source.symbol === ETH;
            const isSourceNetworkToken = source.symbol === BNT;

            context(`basic trades from ${source.symbol} to ${target.symbol}`, () => {
                const testAmount = BigNumber.from(1000);

                beforeEach(async () => {
                    await setupPools(source, target);

                    if (!isSourceETH) {
                        const reserveToken = await Contracts.TestERC20Token.attach(sourceToken.address);

                        await reserveToken.transfer(await trader.getAddress(), testAmount);
                        await reserveToken.connect(trader).approve(network.address, testAmount);
                    }
                });

                const options = !isSourceNetworkToken && !isSourceETH ? [false, true] : [false];
                for (const permitted of options) {
                    context(`${permitted ? 'regular' : 'permitted'} trade`, () => {
                        const tradeFunc = permitted ? tradePermitted : trade;

                        it('should revert when attempting to trade or query using an invalid source pool', async () => {
                            await expect(
                                tradeFunc(testAmount, { sourceTokenAddress: ZERO_ADDRESS })
                            ).to.be.revertedWith('InvalidAddress');
                            await expect(
                                tradePermitted(testAmount, { sourceTokenAddress: ZERO_ADDRESS })
                            ).to.be.revertedWith('InvalidAddress');

                            await expect(
                                tradeTargetAmount(testAmount, { sourceTokenAddress: ZERO_ADDRESS })
                            ).to.be.revertedWith('InvalidAddress');
                            await expect(
                                tradeSourceAmount(testAmount, { sourceTokenAddress: ZERO_ADDRESS })
                            ).to.be.revertedWith('InvalidAddress');
                        });

                        it('should revert when attempting to trade or query using an invalid target pool', async () => {
                            await expect(
                                tradeFunc(testAmount, { targetTokenAddress: ZERO_ADDRESS })
                            ).to.be.revertedWith('InvalidAddress');
                            await expect(
                                tradeTargetAmount(testAmount, { targetTokenAddress: ZERO_ADDRESS })
                            ).to.be.revertedWith('InvalidAddress');
                            await expect(
                                tradeSourceAmount(testAmount, { targetTokenAddress: ZERO_ADDRESS })
                            ).to.be.revertedWith('InvalidAddress');
                        });

                        it('should revert when attempting to trade or query using an invalid amount', async () => {
                            const amount = BigNumber.from(0);

                            await expect(tradeFunc(amount)).to.be.revertedWith('ZeroValue');
                            await expect(tradeTargetAmount(amount)).to.be.revertedWith('ZeroValue');
                            await expect(tradeSourceAmount(amount)).to.be.revertedWith('ZeroValue');
                        });

                        it('should revert when attempting to trade using an invalid minimum return amount', async () => {
                            const minReturnAmount = BigNumber.from(0);

                            await expect(tradeFunc(testAmount, { minReturnAmount })).to.be.revertedWith('ZeroValue');
                        });

                        it('should revert when attempting to trade using an expired deadline', async () => {
                            const deadline = (await latest()).sub(BigNumber.from(1000));

                            await expect(tradeFunc(testAmount, { deadline })).to.be.revertedWith(
                                permitted ? 'ERC20Permit: expired deadline' : 'DeadlineExpired'
                            );
                        });

                        it('should revert when attempting to trade or query using unsupported tokens', async () => {
                            const reserveToken2 = await Contracts.TestERC20Token.deploy(
                                TKN,
                                TKN,
                                BigNumber.from(1_000_000)
                            );

                            await reserveToken2.transfer(await trader.getAddress(), testAmount);
                            await reserveToken2.connect(trader).approve(network.address, testAmount);

                            // unknown source token
                            await expect(
                                trade(testAmount, { sourceTokenAddress: reserveToken2.address })
                            ).to.be.revertedWith('InvalidToken');
                            await expect(
                                tradeTargetAmount(testAmount, { sourceTokenAddress: reserveToken2.address })
                            ).to.be.revertedWith('InvalidToken');
                            await expect(
                                tradeSourceAmount(testAmount, { sourceTokenAddress: reserveToken2.address })
                            ).to.be.revertedWith('InvalidToken');

                            // unknown target token
                            await expect(
                                trade(testAmount, { targetTokenAddress: reserveToken2.address })
                            ).to.be.revertedWith('InvalidToken');
                            await expect(
                                tradeTargetAmount(testAmount, { targetTokenAddress: reserveToken2.address })
                            ).to.be.revertedWith('InvalidToken');
                            await expect(
                                tradeSourceAmount(testAmount, { targetTokenAddress: reserveToken2.address })
                            ).to.be.revertedWith('InvalidToken');
                        });

                        it('should revert when attempting to trade or query using same source and target tokens', async () => {
                            await expect(
                                trade(testAmount, { targetTokenAddress: sourceToken.address })
                            ).to.be.revertedWith('InvalidTokens');
                            await expect(
                                tradeTargetAmount(testAmount, { targetTokenAddress: sourceToken.address })
                            ).to.be.revertedWith('InvalidTokens');
                            await expect(
                                tradeSourceAmount(testAmount, { targetTokenAddress: sourceToken.address })
                            ).to.be.revertedWith('InvalidTokens');
                        });

                        it('should support a custom beneficiary', async () => {
                            const trader2 = (await ethers.getSigners())[9];
                            await verifyTrade(trader, trader2.address, testAmount, trade);
                        });
                    });
                }

                if (isSourceETH) {
                    it('should revert when attempting to trade a different amount than what was actually sent', async () => {
                        await expect(
                            trade(testAmount, {
                                value: testAmount.add(BigNumber.from(1))
                            })
                        ).to.be.revertedWith('EthAmountMismatch');

                        await expect(
                            trade(testAmount, {
                                value: testAmount.sub(BigNumber.from(1))
                            })
                        ).to.be.revertedWith('EthAmountMismatch');

                        await expect(trade(testAmount, { value: BigNumber.from(0) })).to.be.revertedWith('InvalidPool');
                    });
                } else {
                    it('should revert when passing ETH with a non ETH trade', async () => {
                        await expect(trade(testAmount, { value: BigNumber.from(1) })).to.be.revertedWith('InvalidPool');
                    });

                    context('with an insufficient approval', () => {
                        const extraAmount = BigNumber.from(10);
                        const testAmount2 = testAmount.add(extraAmount);

                        beforeEach(async () => {
                            const reserveToken = await Contracts.TestERC20Token.attach(sourceToken.address);
                            await reserveToken.transfer(await trader.getAddress(), extraAmount);
                        });

                        it('should revert when attempting to trade', async () => {
                            await expect(trade(testAmount2)).to.be.revertedWith(
                                errorMessageTokenExceedsAllowance(source.symbol)
                            );
                        });

                        if (!isSourceNetworkToken) {
                            it('should revert when attempting to trade permitted', async () => {
                                await expect(
                                    tradePermitted(testAmount2, { approvedAmount: testAmount })
                                ).to.be.revertedWith('ERC20Permit: invalid signature');
                            });
                        }
                    });
                }
            });

            // perform permitted trades suite over a fixed input
            testPermittedTrades(source, target, toWei(BigNumber.from(100_000)));
        };

        const testTrades = (source: PoolSpec, target: PoolSpec, amount: BigNumber) => {
            const isSourceETH = source.symbol === ETH;

            context(`trade ${amount} tokens from ${specToString(source)} to ${specToString(target)}`, () => {
                const TRADES_COUNT = 2;

                const test = async () => {
                    if (!isSourceETH) {
                        const reserveToken = await Contracts.TestERC20Token.attach(sourceToken.address);
                        await reserveToken.connect(trader).approve(network.address, amount);
                    }

                    await verifyTrade(trader, ZERO_ADDRESS, amount, trade);
                };

                beforeEach(async () => {
                    await setupPools(source, target);

                    if (!isSourceETH) {
                        const reserveToken = await Contracts.TestERC20Token.attach(sourceToken.address);
                        await reserveToken.transfer(trader.address, amount.mul(BigNumber.from(TRADES_COUNT)));
                    }
                });

                it.only('should complete multiple trades', async () => {
                    for (let i = 0; i < TRADES_COUNT; i++) {
                        await test();
                    }
                });
            });
        };

        const testPermittedTrades = (source: PoolSpec, target: PoolSpec, amount: BigNumber) => {
            const isSourceETH = source.symbol === ETH;
            const isSourceNetworkToken = source.symbol === BNT;

            context(`trade permitted ${amount} tokens from ${specToString(source)} to ${specToString(target)}`, () => {
                const test = async () => verifyTrade(trader, ZERO_ADDRESS, amount, tradePermitted);

                beforeEach(async () => {
                    await setupPools(source, target);

                    if (!isSourceETH) {
                        const reserveToken = await Contracts.TestERC20Token.attach(sourceToken.address);
                        await reserveToken.transfer(trader.address, amount);
                    }
                });

                if (isSourceNetworkToken || isSourceETH) {
                    it('should revert when attempting to trade', async () => {
                        await expect(tradePermitted(amount)).to.be.revertedWith('PermitUnsupported');
                    });

                    return;
                }

                it.only('should complete a trade', async () => {
                    await test();
                });
            });
        };

        for (const [sourceSymbol, targetSymbol] of [
            [TKN, BNT],
            [TKN, ETH],
            [`${TKN}1`, `${TKN}2`],
            [BNT, ETH],
            [BNT, TKN],
            [ETH, BNT],
            [ETH, TKN]
        ]) {
            // perform a basic/sanity suite over a fixed input
            testTradesBasic(
                {
                    symbol: sourceSymbol,
                    balance: toWei(BigNumber.from(1_000_000)),
                    initialRate: INITIAL_RATE
                },
                {
                    symbol: targetSymbol,
                    balance: toWei(BigNumber.from(5_000_000)),
                    initialRate: INITIAL_RATE
                }
            );

            for (const sourceBalance of [toWei(BigNumber.from(1_000_000)), toWei(BigNumber.from(50_000_000))]) {
                for (const targetBalance of [toWei(BigNumber.from(1_000_000)), toWei(BigNumber.from(50_000_000))]) {
                    for (const amount of [BigNumber.from(10_000), toWei(BigNumber.from(500_000))]) {
                        const TRADING_FEES = [0, 50_000];
                        for (const tradingFeePPM of TRADING_FEES) {
                            const isSourceNetworkToken = sourceSymbol === BNT;
                            const isTargetNetworkToken = targetSymbol === BNT;

                            // if either the source or the target token is the network token - only test fee in one of
                            // the directions
                            if (isSourceNetworkToken || isTargetNetworkToken) {
                                testTrades(
                                    {
                                        symbol: sourceSymbol,
                                        balance: sourceBalance,
                                        tradingFeePPM: isSourceNetworkToken ? undefined : tradingFeePPM,
                                        initialRate: INITIAL_RATE
                                    },
                                    {
                                        symbol: targetSymbol,
                                        balance: targetBalance,
                                        tradingFeePPM: isTargetNetworkToken ? undefined : tradingFeePPM,
                                        initialRate: INITIAL_RATE
                                    },
                                    amount
                                );
                            } else {
                                for (const tradingFeePPM2 of TRADING_FEES) {
                                    testTrades(
                                        {
                                            symbol: sourceSymbol,
                                            balance: sourceBalance,
                                            tradingFeePPM,
                                            initialRate: INITIAL_RATE
                                        },
                                        {
                                            symbol: targetSymbol,
                                            balance: targetBalance,
                                            tradingFeePPM: tradingFeePPM2,
                                            initialRate: INITIAL_RATE
                                        },
                                        amount
                                    );
                                }
                            }
                        }
                    }
                }
            }
        }
    });

    describe('flash-loans', () => {
        let network: TestBancorNetwork;
        let networkSettings: NetworkSettings;
        let networkToken: NetworkToken;
        let networkTokenPool: TestNetworkTokenPool;
        let poolCollection: TestPoolCollection;
        let bancorVault: BancorVault;
        let recipient: TestFlashLoanRecipient;
        let token: TokenWithAddress;

        const amount = toWei(BigNumber.from(123456));

        const MIN_LIQUIDITY_FOR_TRADING = toWei(BigNumber.from(100_000));
        const ZERO_BYTES = '0x';
        const ZERO_BYTES32 = formatBytes32String('');

        const setup = async () => {
            ({ network, networkSettings, networkToken, networkTokenPool, poolCollection, bancorVault } =
                await createSystem());

            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);
            await networkSettings.setPoolMintingLimit(networkToken.address, MAX_UINT256);

            recipient = await Contracts.TestFlashLoanRecipient.deploy(network.address);
        };

        beforeEach(async () => {
            await waffle.loadFixture(setup);
        });

        describe('basic tests', () => {
            beforeEach(async () => {
                ({ token } = await setupSimplePool(
                    {
                        symbol: TKN,
                        balance: amount,
                        initialRate: INITIAL_RATE
                    },
                    deployer,
                    network,
                    networkSettings,
                    poolCollection
                ));
            });

            it('should revert when attempting to request a flash-loan of an invalid token', async () => {
                await expect(network.flashLoan(ZERO_ADDRESS, amount, recipient.address, ZERO_BYTES)).to.be.revertedWith(
                    'InvalidAddress'
                );
            });

            it('should revert when attempting to request a flash-loan of a non-whitelisted token', async () => {
                const reserveToken = await createTokenBySymbol(TKN);
                await expect(
                    network.flashLoan(reserveToken.address, amount, recipient.address, ZERO_BYTES)
                ).to.be.revertedWith('NotWhitelisted');
            });

            it('should revert when attempting to request a flash-loan of an invalid amount', async () => {
                await expect(
                    network.flashLoan(token.address, BigNumber.from(0), recipient.address, ZERO_BYTES)
                ).to.be.revertedWith('ZeroValue');
            });

            it('should revert when attempting to request a flash-loan for an invalid recipient', async () => {
                await expect(network.flashLoan(token.address, amount, ZERO_ADDRESS, ZERO_BYTES)).to.be.revertedWith(
                    'InvalidAddress'
                );
            });

            context('reentering', () => {
                beforeEach(async () => {
                    await recipient.setReenter(true);
                });

                it('should revert when attempting to request a flash-loan', async () => {
                    await expect(
                        network.flashLoan(token.address, amount, recipient.address, ZERO_BYTES)
                    ).to.be.revertedWith('ReentrancyGuard: reentrant call');
                });
            });

            it('should revert when attempting to request a flash-loan of more than the pool has', async () => {
                await expect(
                    network.flashLoan(token.address, amount.add(1), recipient.address, ZERO_BYTES)
                ).to.be.revertedWith('ERC20: transfer amount exceeds balance');
            });
        });

        const testFlashLoan = async (symbol: string, flashLoanFeePPM: BigNumber) => {
            const feeAmount = amount.mul(flashLoanFeePPM).div(PPM_RESOLUTION);

            beforeEach(async () => {
                if (symbol === BNT) {
                    token = networkToken;

                    const reserveToken = await createTokenBySymbol(TKN);

                    await networkSettings.setPoolMintingLimit(reserveToken.address, MAX_UINT256);
                    await network.requestLiquidityT(ZERO_BYTES32, reserveToken.address, amount);

                    await depositToPool(deployer, networkToken, amount, network);
                } else {
                    ({ token } = await setupSimplePool(
                        {
                            symbol,
                            balance: amount,
                            initialRate: INITIAL_RATE
                        },
                        deployer,
                        network,
                        networkSettings,
                        poolCollection
                    ));
                }

                await networkSettings.setFlashLoanFeePPM(flashLoanFeePPM);

                await transfer(deployer, token, recipient.address, feeAmount);
                await recipient.snapshot(token.address);
            });

            const test = async () => {
                const prevVaultBalance = await getBalance(token, bancorVault.address);
                const prevNetworkBalance = await getBalance(token, network.address);

                let prevStakedBalance;
                if (symbol === BNT) {
                    prevStakedBalance = await networkTokenPool.stakedBalance();
                } else {
                    prevStakedBalance = (await poolCollection.poolLiquidity(token.address)).stakedBalance;
                }

                const data = '0x1234';
                const contextId = solidityKeccak256(
                    ['address', 'uint32', 'address', 'uint256', 'address', 'bytes'],
                    [deployer.address, await network.currentTime(), token.address, amount, recipient.address, data]
                );

                const res = await profile(
                    `flash-loan ${symbol}`,
                    network.flashLoan(token.address, amount, recipient.address, data)
                );

                await expect(res)
                    .to.emit(network, 'FlashLoanCompleted')
                    .withArgs(contextId, token.address, deployer.address, amount);

                await expect(res)
                    .to.emit(network, 'FeesCollected')
                    .withArgs(
                        contextId,
                        token.address,
                        FeeTypes.FlashLoan,
                        feeAmount,
                        prevStakedBalance.add(feeAmount)
                    );

                const callbackData = await recipient.callbackData();
                expect(callbackData.sender).to.equal(deployer.address);
                expect(callbackData.token).to.equal(token.address);
                expect(callbackData.amount).to.equal(amount);
                expect(callbackData.feeAmount).to.equal(feeAmount);
                expect(callbackData.data).to.equal(data);
                expect(callbackData.receivedAmount).to.equal(amount);

                expect(await getBalance(token, bancorVault.address)).to.be.gte(prevVaultBalance.add(feeAmount));
                expect(await getBalance(token, network.address)).to.equal(prevNetworkBalance);
            };

            context('not repaying the original amount', () => {
                beforeEach(async () => {
                    await recipient.setAmountToReturn(amount.sub(1));
                });

                it('should revert when attempting to request a flash-loan', async () => {
                    await expect(
                        network.flashLoan(token.address, amount, recipient.address, ZERO_BYTES)
                    ).to.be.revertedWith('InsufficientFlashLoanReturn');
                });
            });

            if (flashLoanFeePPM.gt(0)) {
                context('not repaying the fee', () => {
                    beforeEach(async () => {
                        await recipient.setAmountToReturn(amount);
                    });

                    it('should revert when attempting to request a flash-loan', async () => {
                        await expect(
                            network.flashLoan(token.address, amount, recipient.address, ZERO_BYTES)
                        ).to.be.revertedWith('InsufficientFlashLoanReturn');
                    });
                });
            }

            context('repaying more than required', () => {
                beforeEach(async () => {
                    const extraReturn = toWei(BigNumber.from(12345));

                    await transfer(deployer, token, recipient.address, extraReturn);
                    await recipient.snapshot(token.address);

                    await recipient.setAmountToReturn(amount.add(feeAmount).add(extraReturn));
                });

                it.only('should succeed requesting a flash-loan', async () => {
                    await test();
                });
            });

            context('returning just about right', () => {
                beforeEach(async () => {
                    await recipient.setAmountToReturn(amount.add(feeAmount));
                });

                it.only('should succeed requesting a flash-loan', async () => {
                    await test();
                });
            });
        };

        for (const symbol of [BNT, ETH, TKN]) {
            for (const flashLoanFeePPM of [0, 10_000, 100_000]) {
                context(`${symbol} with fee=${feeToString(flashLoanFeePPM)}`, () => {
                    testFlashLoan(symbol, BigNumber.from(flashLoanFeePPM));
                });
            }
        }
    });
});
