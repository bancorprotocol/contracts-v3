import Contracts, { TestTokenLibrary } from '../../components/Contracts';
import { ZERO_ADDRESS } from '../../utils/Constants';
import { TokenData, TokenSymbol, NATIVE_TOKEN_ADDRESS } from '../../utils/TokenData';
import { createToken } from '../helpers/Factory';
import { getBalance } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('TokenLibrary', () => {
    const TOTAL_SUPPLY = 1_000_000;

    let tokenLibrary: TestTokenLibrary;

    let deployer: SignerWithAddress;
    let recipient: SignerWithAddress;
    let spender: SignerWithAddress;
    let sender: string;

    before(async () => {
        [deployer, recipient, spender] = await ethers.getSigners();
    });

    beforeEach(async () => {
        tokenLibrary = await Contracts.TestTokenLibrary.deploy();
        sender = tokenLibrary.address;
    });

    for (const symbol of [TokenSymbol.ETH, TokenSymbol.TKN]) {
        let token: any;
        const tokenData = new TokenData(symbol);

        context(`${symbol} reserve token`, () => {
            beforeEach(async () => {
                token = await createToken(tokenData, TOTAL_SUPPLY);

                if (tokenData.isNative()) {
                    await deployer.sendTransaction({
                        to: tokenLibrary.address,
                        value: TOTAL_SUPPLY / 2
                    });
                } else {
                    await token.transfer(sender, TOTAL_SUPPLY / 2);
                }
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
                expect(await tokenLibrary.balanceOf(token.address, sender)).to.equal(await getBalance(token, sender));
            });

            for (const amount of [0, 10_000]) {
                it('should properly transfer the reserve token', async () => {
                    const prevSenderBalance = await getBalance(token, sender);
                    const prevRecipientBalance = await getBalance(token, recipient);

                    await tokenLibrary.safeTransfer(token.address, recipient.address, amount);

                    expect(await getBalance(token, sender)).to.equal(prevSenderBalance.sub(amount));
                    expect(await getBalance(token, recipient)).to.equal(prevRecipientBalance.add(amount));
                });
            }

            if (tokenData.isNative()) {
                it('should ignore the request to transfer the reserve token on behalf of a different account', async () => {
                    const prevSenderBalance = await getBalance(token, sender);
                    const prevRecipientBalance = await getBalance(token, recipient);

                    const amount = 100_000;
                    await tokenLibrary.ensureApprove(token.address, sender, amount);
                    await tokenLibrary.safeTransferFrom(token.address, sender, recipient.address, amount);

                    expect(await getBalance(token, sender)).to.equal(prevSenderBalance);
                    expect(await getBalance(token, recipient)).to.equal(prevRecipientBalance);
                });
            } else {
                for (const amount of [0, 10_000]) {
                    it('should properly transfer the reserve token on behalf of a different account', async () => {
                        const prevSenderBalance = await getBalance(token, sender);
                        const prevRecipientBalance = await getBalance(token, recipient);

                        await tokenLibrary.ensureApprove(token.address, sender, amount);
                        await tokenLibrary.safeTransferFrom(token.address, sender, recipient.address, amount);

                        expect(await getBalance(token, sender)).to.equal(prevSenderBalance.sub(amount));
                        expect(await getBalance(token, recipient)).to.equal(prevRecipientBalance.add(amount));
                    });

                    it('should setting the allowance', async () => {
                        const allowance = 1_000_000;

                        await tokenLibrary.ensureApprove(token.address, spender.address, allowance);

                        expect(await token.allowance(sender, spender.address)).to.equal(allowance);
                    });
                }
            }

            it('should compare', async () => {
                expect(await tokenLibrary.isEqual(token.address, token.address)).to.be.true;
                expect(await tokenLibrary.isEqual(token.address, ZERO_ADDRESS)).to.be.false;

                expect(await tokenLibrary.isEqual(token.address, NATIVE_TOKEN_ADDRESS)).to.equal(tokenData.isNative());
            });
        });
    }
});
