import { expect } from 'chai';
import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import Contracts from 'components/Contracts';
import { TestERC20Token, TokenHolderUpgradeable } from 'typechain';

import { NATIVE_TOKEN_ADDRESS, ZERO_ADDRESS } from 'test/helpers/Constants';
import { getBalance, getBalances, TokenWithAddress } from 'test/helpers/Utils';

let holder: TokenHolderUpgradeable;
let token1: TestERC20Token;
let token2: TestERC20Token;

let accounts: SignerWithAddress[];
let owner: SignerWithAddress;
let receiver: SignerWithAddress;
let nonOwner: SignerWithAddress;
let proxyAdmin: SignerWithAddress;

describe('TokenHolderUpgradeable', () => {
    before(async () => {
        accounts = await ethers.getSigners();

        [owner, receiver, nonOwner, proxyAdmin] = accounts;
    });

    beforeEach(async () => {
        token1 = await Contracts.TestERC20Token.deploy('ERC', 'ERC1', 100000);
        token2 = await Contracts.TestERC20Token.deploy('ERC', 'ERC2', 100000);
    });

    const testTokenHolder = (createTokenHolder: () => Promise<TokenHolderUpgradeable>) => {
        beforeEach(async () => {
            holder = await createTokenHolder();

            await accounts[0].sendTransaction({ to: holder.address, value: 5000 });
            await token1.transfer(holder.address, BigNumber.from(1000));
            await token2.transfer(holder.address, BigNumber.from(1000));
        });

        describe('withdraw asset', () => {
            for (const isETH of [true, false]) {
                context(isETH ? 'ETH' : 'ERC20', async () => {
                    let asset: TokenWithAddress;

                    beforeEach(async () => {
                        asset = isETH ? { address: NATIVE_TOKEN_ADDRESS } : token1;
                    });

                    it('should allow the owner to withdraw', async () => {
                        const prevBalance = await getBalance(asset, receiver.address);

                        const amount = BigNumber.from(100);
                        await holder.withdrawTokens(asset.address, receiver.address, amount);

                        const balance = await getBalance(asset, receiver.address);
                        expect(balance).to.equal(prevBalance.add(amount));
                    });

                    it('should not revert when withdrawing zero amount', async () => {
                        const prevBalance = await getBalance(asset, receiver.address);

                        await holder.withdrawTokens(asset.address, receiver.address, BigNumber.from(0));

                        const balance = await getBalance(asset, receiver.address);
                        expect(balance).to.equal(prevBalance);
                    });

                    it('should revert when a non-owner attempts to withdraw', async () => {
                        await expect(
                            holder.connect(nonOwner).withdrawTokens(asset.address, receiver.address, BigNumber.from(1))
                        ).to.be.revertedWith('ERR_ACCESS_DENIED');
                    });

                    it('should revert when attempting to withdraw from an invalid asset address', async () => {
                        await expect(
                            holder.withdrawTokens(ZERO_ADDRESS, receiver.address, BigNumber.from(1))
                        ).to.be.revertedWith('Address: call to non-contract');
                    });

                    it('should revert when attempting to withdraw tokens to an invalid account address', async () => {
                        await expect(
                            holder.withdrawTokens(asset.address, ZERO_ADDRESS, BigNumber.from(1))
                        ).to.be.revertedWith('ERR_INVALID_ADDRESS');
                    });

                    it('should revert when attempting to withdraw an amount greater than the holder balance', async () => {
                        const balance = await getBalance(asset, holder.address);
                        const amount = balance.add(BigNumber.from(1));

                        await expect(holder.withdrawTokens(asset.address, receiver.address, amount)).to.be.revertedWith(
                            !isETH ? 'ERC20: transfer amount exceeds balance' : ''
                        );
                    });
                });
            }
        });

        describe('withdraw multiple assets', () => {
            let assets: TokenWithAddress[];
            let assetAddresses: string[];
            let amounts: { [address: string]: BigNumber } = {};

            beforeEach(async () => {
                assets = [{ address: NATIVE_TOKEN_ADDRESS }, token1, token2];
                assetAddresses = assets.map((a) => a.address);

                for (let i = 0; i < assets.length; ++i) {
                    const asset = assets[i];
                    amounts[asset.address] = BigNumber.from(100 * (i + 1));
                }
            });

            it('should allow the owner to withdraw', async () => {
                const prevBalances = await getBalances(assets, receiver.address);

                await holder.withdrawTokensMultiple(assetAddresses, receiver.address, Object.values(amounts));

                const newBalances = await getBalances(assets, receiver.address);
                for (const [tokenAddress, prevBalance] of Object.entries(prevBalances)) {
                    expect(newBalances[tokenAddress]).to.equal(prevBalance.add(amounts[tokenAddress]));
                }
            });

            it('should revert when a non-owner attempts to withdraw', async () => {
                await expect(
                    holder
                        .connect(nonOwner)
                        .withdrawTokensMultiple(assetAddresses, receiver.address, Object.values(amounts))
                ).to.be.revertedWith('ERR_ACCESS_DENIED');
            });

            it('should revert when attempting to withdraw from an invalid asset address', async () => {
                await expect(
                    holder.withdrawTokensMultiple([token1.address, ZERO_ADDRESS], receiver.address, [
                        BigNumber.from(1),
                        BigNumber.from(1)
                    ])
                ).to.be.revertedWith('Address: call to non-contract');

                await expect(
                    holder.withdrawTokensMultiple([ZERO_ADDRESS, token1.address], receiver.address, [
                        BigNumber.from(1),
                        BigNumber.from(1)
                    ])
                ).to.be.revertedWith('Address: call to non-contract');
            });

            it('should revert when attempting to withdraw tokens to an invalid account address', async () => {
                await expect(
                    holder.withdrawTokensMultiple(assetAddresses, ZERO_ADDRESS, Object.values(amounts))
                ).to.be.revertedWith('ERR_INVALID_ADDRESS');
            });

            it('should revert when attempting to withdraw an amount greater than the holder balance', async () => {
                let balances = await getBalances(assets, holder.address);
                balances[NATIVE_TOKEN_ADDRESS] = balances[NATIVE_TOKEN_ADDRESS].add(BigNumber.from(1));
                await expect(holder.withdrawTokensMultiple(assetAddresses, receiver.address, Object.values(balances)))
                    .to.be.reverted;

                balances = await getBalances(assets, holder.address);
                balances[token2.address] = balances[token2.address].add(BigNumber.from(1));
                await expect(
                    holder.withdrawTokensMultiple(assetAddresses, receiver.address, Object.values(balances))
                ).to.be.revertedWith('ERC20: transfer amount exceeds balance');
            });
        });
    };

    context('as a regular contract ', () => {
        testTokenHolder(async () => {
            const holder = await Contracts.TokenHolderUpgradeable.deploy();
            await holder.initialize();

            return holder;
        });
    });

    context('as a proxy', () => {
        testTokenHolder(async () => {
            const logic = await Contracts.TokenHolderUpgradeable.deploy();

            const proxy = await Contracts.TransparentUpgradeableProxy.deploy(
                logic.address,
                proxyAdmin.address,
                logic.interface.encodeFunctionData('initialize')
            );

            return Contracts.TokenHolderUpgradeable.attach(proxy.address);
        });
    });
});
