import Contracts from '../../components/Contracts';
import { TestReserveToken } from '../../typechain-types';
import { NATIVE_TOKEN_ADDRESS, NATIVE_TOKEN_DECIMALS, ETH, TKN } from '../helpers/Constants';
import { getBalance } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';

describe('ReserveToken', () => {
    const TOTAL_SUPPLY = BigNumber.from(1_000_000);

    let reserveToken: TestReserveToken;

    let deployer: SignerWithAddress;
    let recipient: SignerWithAddress;
    let spender: SignerWithAddress;
    let sender: string;

    before(async () => {
        [deployer, recipient, spender] = await ethers.getSigners();
    });

    beforeEach(async () => {
        reserveToken = await Contracts.TestReserveToken.deploy();
        sender = reserveToken.address;
    });

    for (const symbol of [ETH, TKN]) {
        let token: any;
        const isETH = symbol === ETH;

        context(`${symbol} reserve token`, () => {
            beforeEach(async () => {
                if (isETH) {
                    token = { address: NATIVE_TOKEN_ADDRESS };

                    await deployer.sendTransaction({
                        to: reserveToken.address,
                        value: TOTAL_SUPPLY.div(BigNumber.from(2))
                    });
                } else {
                    token = await Contracts.TestERC20Token.deploy(symbol, symbol, TOTAL_SUPPLY);

                    await token.transfer(sender, TOTAL_SUPPLY.div(BigNumber.from(2)));
                }
            });

            it('should properly check if the reserve token is a native token', async () => {
                expect(await reserveToken.isNativeToken(token.address)).to.equal(isETH);
            });

            it('should properly get the right symbol', async () => {
                expect(await reserveToken.symbol(token.address)).to.equal(symbol);
            });

            it('should properly get the right decimals', async () => {
                if (isETH) {
                    expect(await reserveToken.decimals(token.address)).to.equal(NATIVE_TOKEN_DECIMALS);
                } else {
                    const decimals = await token.decimals();
                    expect(await reserveToken.decimals(token.address)).to.equal(decimals);

                    const decimals2 = BigNumber.from(4);
                    await token.updateDecimals(decimals2);
                    expect(await reserveToken.decimals(token.address)).to.equal(decimals2);
                }
            });

            it('should properly get the right balance', async () => {
                expect(await reserveToken.balanceOf(token.address, sender)).to.equal(await getBalance(token, sender));
            });

            for (const amount of [BigNumber.from(0), BigNumber.from(10000)]) {
                it('should properly transfer the reserve token', async () => {
                    const prevSenderBalance = await getBalance(token, sender);
                    const prevRecipientBalance = await getBalance(token, recipient);

                    await reserveToken.safeTransfer(token.address, recipient.address, amount);

                    expect(await getBalance(token, sender)).to.equal(prevSenderBalance.sub(amount));
                    expect(await getBalance(token, recipient)).to.equal(prevRecipientBalance.add(amount));
                });
            }

            if (isETH) {
                it('should ignore the request to transfer the reserve token on behalf of a different account', async () => {
                    const prevSenderBalance = await getBalance(token, sender);
                    const prevRecipientBalance = await getBalance(token, recipient);

                    const amount = BigNumber.from(100000);
                    await reserveToken.ensureApprove(token.address, sender, amount);
                    await reserveToken.safeTransferFrom(token.address, sender, recipient.address, amount);

                    expect(await getBalance(token, sender)).to.equal(prevSenderBalance);
                    expect(await getBalance(token, recipient)).to.equal(prevRecipientBalance);
                });
            } else {
                for (const amount of [BigNumber.from(0), BigNumber.from(10000)]) {
                    it('should properly transfer the reserve token on behalf of a different account', async () => {
                        const prevSenderBalance = await getBalance(token, sender);
                        const prevRecipientBalance = await getBalance(token, recipient);

                        await reserveToken.ensureApprove(token.address, sender, amount);
                        await reserveToken.safeTransferFrom(token.address, sender, recipient.address, amount);

                        expect(await getBalance(token, sender)).to.equal(prevSenderBalance.sub(amount));
                        expect(await getBalance(token, recipient)).to.equal(prevRecipientBalance.add(amount));
                    });

                    it('should setting the allowance', async () => {
                        const allowance = BigNumber.from(1000000);

                        await reserveToken.ensureApprove(token.address, spender.address, allowance);

                        expect(await token.allowance(sender, spender.address)).to.equal(allowance);
                    });
                }
            }
        });
    }
});
