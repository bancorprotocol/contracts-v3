import Contracts, { TestTokenLibrary } from '../../components/Contracts';
import { ZERO_ADDRESS } from '../../utils/Constants';
import { NATIVE_TOKEN_ADDRESS, TokenData, TokenSymbol } from '../../utils/TokenData';
import { createToken } from '../helpers/Factory';
import { getBalance, transfer } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('TokenLibrary', () => {
    const TOTAL_SUPPLY = 1_000_000;

    let tokenLibrary: TestTokenLibrary;

    let deployer: SignerWithAddress;
    let recipient: SignerWithAddress;
    let spender: SignerWithAddress;

    before(async () => {
        [deployer, recipient, spender] = await ethers.getSigners();
    });

    beforeEach(async () => {
        tokenLibrary = await Contracts.TestTokenLibrary.deploy();
    });

    for (const symbol of [TokenSymbol.ETH, TokenSymbol.TKN]) {
        let token: any;
        const tokenData = new TokenData(symbol);

        context(`${symbol} reserve token`, () => {
            beforeEach(async () => {
                token = await createToken(tokenData, TOTAL_SUPPLY);
            });

            it('should properly check if the reserve token is a native token', async () => {
                expect(await tokenLibrary.isNative(token.address)).to.equal(tokenData.isNative());
            });

            it('should properly get the right symbol', async () => {
                expect(await tokenLibrary.symbol(token.address)).to.equal(symbol);
            });

            it('should properly get the right decimals', async () => {
                if (tokenData.isNative()) {
                    expect(await tokenLibrary.decimals(token.address)).to.equal(tokenData.decimals());
                } else {
                    const decimals = await token.decimals();
                    expect(await tokenLibrary.decimals(token.address)).to.equal(decimals);

                    const decimals2 = 4;
                    await token.updateDecimals(decimals2);
                    expect(await tokenLibrary.decimals(token.address)).to.equal(decimals2);
                }
            });

            it('should properly get the right balance', async () => {
                expect(await tokenLibrary.balanceOf(token.address, deployer.address)).to.equal(
                    await getBalance(token, deployer)
                );
            });

            for (const amount of [0, 10_000]) {
                beforeEach(async () => {
                    await transfer(deployer, token, tokenLibrary.address, amount);
                });

                it('should properly transfer the reserve token', async () => {
                    const prevLibraryBalance = await getBalance(token, tokenLibrary.address);
                    const prevRecipientBalance = await getBalance(token, recipient);

                    await tokenLibrary.safeTransfer(token.address, recipient.address, amount);

                    expect(await getBalance(token, tokenLibrary.address)).to.equal(prevLibraryBalance.sub(amount));
                    expect(await getBalance(token, recipient)).to.equal(prevRecipientBalance.add(amount));
                });
            }

            if (tokenData.isNative()) {
                it('should ignore the request to transfer the reserve token on behalf of a different account using safe approve', async () => {
                    const prevLibraryBalance = await getBalance(token, tokenLibrary.address);
                    const prevRecipientBalance = await getBalance(token, recipient);

                    const amount = 100_000;
                    await tokenLibrary.safeApprove(token.address, tokenLibrary.address, amount);
                    await tokenLibrary.safeTransferFrom(token.address, tokenLibrary.address, recipient.address, amount);

                    expect(await getBalance(token, tokenLibrary.address)).to.equal(prevLibraryBalance);
                    expect(await getBalance(token, recipient)).to.equal(prevRecipientBalance);
                });

                it('should ignore the request to transfer the reserve token on behalf of a different account using ensure approve', async () => {
                    const prevLibraryBalance = await getBalance(token, tokenLibrary.address);
                    const prevRecipientBalance = await getBalance(token, recipient);

                    const amount = 100_000;
                    await tokenLibrary.ensureApprove(token.address, tokenLibrary.address, amount);
                    await tokenLibrary.safeTransferFrom(token.address, tokenLibrary.address, recipient.address, amount);

                    expect(await getBalance(token, tokenLibrary.address)).to.equal(prevLibraryBalance);
                    expect(await getBalance(token, recipient)).to.equal(prevRecipientBalance);
                });
            } else {
                for (const amount of [0, 10_000]) {
                    beforeEach(async () => {
                        await transfer(deployer, token, tokenLibrary.address, amount);
                    });

                    it('should properly transfer the reserve token on behalf of a different account using safe approve', async () => {
                        const prevLibraryBalance = await getBalance(token, tokenLibrary.address);
                        const prevRecipientBalance = await getBalance(token, recipient);

                        await tokenLibrary.safeApprove(token.address, tokenLibrary.address, amount);
                        await tokenLibrary.safeTransferFrom(
                            token.address,
                            tokenLibrary.address,
                            recipient.address,
                            amount
                        );

                        expect(await getBalance(token, tokenLibrary.address)).to.equal(prevLibraryBalance.sub(amount));
                        expect(await getBalance(token, recipient)).to.equal(prevRecipientBalance.add(amount));
                    });

                    it('should properly transfer the reserve token on behalf of a different account using ensure approve', async () => {
                        const prevLibraryBalance = await getBalance(token, tokenLibrary.address);
                        const prevRecipientBalance = await getBalance(token, recipient);

                        await tokenLibrary.ensureApprove(token.address, tokenLibrary.address, amount);
                        await tokenLibrary.safeTransferFrom(
                            token.address,
                            tokenLibrary.address,
                            recipient.address,
                            amount
                        );

                        expect(await getBalance(token, tokenLibrary.address)).to.equal(prevLibraryBalance.sub(amount));
                        expect(await getBalance(token, recipient)).to.equal(prevRecipientBalance.add(amount));
                    });
                }

                it('should allow setting the allowance using safe approve', async () => {
                    const allowance = 1_000_000;

                    await tokenLibrary.safeApprove(token.address, spender.address, allowance);

                    expect(await token.allowance(tokenLibrary.address, spender.address)).to.equal(allowance);
                });

                it('should allow setting the allowance using ensure approve', async () => {
                    const allowance = 1_000_000;

                    await tokenLibrary.ensureApprove(token.address, spender.address, allowance);

                    expect(await token.allowance(tokenLibrary.address, spender.address)).to.equal(allowance);
                });
            }

            it('should compare', async () => {
                expect(await tokenLibrary.isEqual(token.address, token.address)).to.be.true;
                expect(await tokenLibrary.isEqual(token.address, ZERO_ADDRESS)).to.be.false;

                expect(await tokenLibrary.isEqual(token.address, NATIVE_TOKEN_ADDRESS)).to.equal(tokenData.isNative());
            });
        });
    }
});
