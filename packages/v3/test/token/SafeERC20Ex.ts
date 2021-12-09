import Contracts from '../../components/Contracts';
import { TestSafeERC20Ex, TestERC20Token } from '../../typechain-types';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';

describe('SafeERC20Ex', () => {
    const TOTAL_SUPPLY = 1_000_000;

    let safeERC20: TestSafeERC20Ex;
    let token: TestERC20Token;

    let spender: SignerWithAddress;
    let sender: string;

    before(async () => {
        [, spender] = await ethers.getSigners();
    });

    beforeEach(async () => {
        safeERC20 = await Contracts.TestSafeERC20Ex.deploy();
        sender = safeERC20.address;

        token = await Contracts.TestERC20Token.deploy('ERC', 'ERC1', TOTAL_SUPPLY);

        await token.transfer(safeERC20.address, TOTAL_SUPPLY / 2);
    });

    it('should set allowance', async () => {
        const amount = 100;

        expect(await token.allowance(sender, spender.address)).to.equal(0);

        await safeERC20.ensureApprove(token.address, spender.address, amount);

        expect(await token.allowance(sender, spender.address)).to.equal(amount);
    });

    context('with existing allowance', () => {
        const allowance = 1000;

        beforeEach(async () => {
            await safeERC20.ensureApprove(token.address, spender.address, allowance);
        });

        it('should ignore the request when the allowance is sufficient', async () => {
            await safeERC20.ensureApprove(token.address, spender.address, allowance - 10);

            expect(await token.allowance(sender, spender.address)).to.equal(allowance);
        });

        it('should allow increasing the allowance', async () => {
            const newAllowance = allowance + 100;

            await safeERC20.ensureApprove(token.address, spender.address, newAllowance);

            expect(await token.allowance(sender, spender.address)).to.equal(newAllowance);
        });

        it('should ignore the request when the allowance is zero', async () => {
            await safeERC20.ensureApprove(token.address, spender.address, 0);

            expect(await token.allowance(sender, spender.address)).to.equal(allowance);
        });
    });
});
