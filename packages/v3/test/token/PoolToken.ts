import { expect } from 'chai';
import { ethers } from 'hardhat';
import { BigNumber, BigNumberish } from 'ethers';
import { TypedDataUtils, signTypedMessage } from 'eth-sig-util';
import { fromRpcSig } from 'ethereumjs-util';
import Wallet from 'ethereumjs-wallet';

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import Contracts from 'components/Contracts';
import { PoolToken } from 'typechain';

import { ZERO_ADDRESS, MAX_UINT256 } from 'test/helpers/Constants';
import { latest, duration } from 'test/helpers/Time';

let poolToken: PoolToken;
let owner: SignerWithAddress;
let spender: SignerWithAddress;
let nonOwner: SignerWithAddress;
let accounts: SignerWithAddress[];

describe('PoolToken', () => {
    before(async () => {
        accounts = await ethers.getSigners();
    });

    beforeEach(async () => {
        poolToken = await Contracts.PoolToken.deploy('POOL', 'POOL', 18);
        owner = accounts[0];
        nonOwner = accounts[1];
        spender = accounts[2];
    });

    describe('minting', () => {
        it('should revert when the owner attempts to issue tokens to an invalid address', async () => {
            await expect(poolToken.mint(ZERO_ADDRESS, BigNumber.from(1))).to.be.revertedWith(
                'ERR_INVALID_EXTERNAL_ADDRESS'
            );
        });

        it('should revert when the owner attempts to issue tokens to the token address', async () => {
            await expect(poolToken.mint(poolToken.address, BigNumber.from(1))).to.be.revertedWith(
                'ERR_INVALID_EXTERNAL_ADDRESS'
            );
        });

        it('should revert when a non owner attempts to issue tokens', async () => {
            await expect(poolToken.connect(nonOwner).mint(owner.address, BigNumber.from(1))).to.be.revertedWith(
                'ERR_ACCESS_DENIED'
            );
        });
    });

    describe('permitting', () => {
        const NAME = 'Bancor';
        const VERSION = '1';
        const HARDHAT_CHAIN_ID = 31337;
        const PERMIT_TYPE: 'EIP712Domain' | 'Permit' = 'Permit';

        const EIP712_DOMAIN = [
            { name: 'name', type: 'string' },
            { name: 'version', type: 'string' },
            { name: 'chainId', type: 'uint256' },
            { name: 'verifyingContract', type: 'address' }
        ];

        const PERMIT = [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'nonce', type: 'uint256' },
            { name: 'deadline', type: 'uint256' }
        ];

        const wallet = Wallet.generate();
        const sender = wallet.getAddressString();

        const domainSeparator = (name: string, version: string, chainId: number, verifyingContract: string) => {
            return (
                '0x' +
                TypedDataUtils.hashStruct(
                    'EIP712Domain',
                    { name, version, chainId, verifyingContract },
                    { EIP712Domain: EIP712_DOMAIN }
                ).toString('hex')
            );
        };

        const buildData = (
            name: string,
            version: string,
            chainId: number,
            verifyingContract: string,
            owner: string,
            spender: string,
            amount: number,
            nonce: number,
            deadline: BigNumberish = MAX_UINT256.toString()
        ) => ({
            primaryType: PERMIT_TYPE,
            types: { EIP712Domain: EIP712_DOMAIN, Permit: PERMIT },
            domain: { name, version, chainId, verifyingContract },
            message: { owner, spender, value: amount, nonce, deadline }
        });

        beforeEach(async () => {
            await poolToken.mint(sender, BigNumber.from(10000));
        });

        it('should permit', async function () {
            const amount = BigNumber.from(1000);

            const data = buildData(
                NAME,
                VERSION,
                HARDHAT_CHAIN_ID,
                poolToken.address,
                sender,
                spender.address,
                amount.toNumber(),
                0
            );
            const signature = signTypedMessage(wallet.getPrivateKey(), { data });
            const { v, r, s } = fromRpcSig(signature);

            await poolToken.permit(sender, spender.address, amount, MAX_UINT256, v, r, s);

            expect(await poolToken.nonces(sender)).to.equal(BigNumber.from(1));
            expect(await poolToken.allowance(sender, spender.address)).to.equal(amount);
        });

        it('should reject a reused signature', async function () {
            const amount = BigNumber.from(100);

            const data = buildData(
                NAME,
                VERSION,
                HARDHAT_CHAIN_ID,
                poolToken.address,
                sender,
                spender.address,
                amount.toNumber(),
                0
            );
            const signature = signTypedMessage(wallet.getPrivateKey(), { data });
            const { v, r, s } = fromRpcSig(signature);

            await poolToken.permit(sender, spender.address, amount, MAX_UINT256, v, r, s);

            await expect(poolToken.permit(sender, spender.address, amount, MAX_UINT256, v, r, s)).to.be.revertedWith(
                'ERC20Permit: invalid signature'
            );
        });

        it('should reject an invalid signature', async function () {
            const amount = BigNumber.from(222);

            const otherWallet = Wallet.generate();
            const data = buildData(
                NAME,
                VERSION,
                HARDHAT_CHAIN_ID,
                poolToken.address,
                sender,
                spender.address,
                amount.toNumber(),
                0
            );
            const signature = signTypedMessage(otherWallet.getPrivateKey(), { data });
            const { v, r, s } = fromRpcSig(signature);

            await expect(poolToken.permit(sender, spender.address, amount, MAX_UINT256, v, r, s)).to.be.revertedWith(
                'ERC20Permit: invalid signature'
            );
        });

        it('should reject an expired permit', async function () {
            const amount = BigNumber.from(500);
            const deadline = (await latest()).sub(duration.weeks(1));

            const data = buildData(
                NAME,
                VERSION,
                HARDHAT_CHAIN_ID,
                poolToken.address,
                sender,
                spender.address,
                amount.toNumber(),
                0,
                deadline.toNumber()
            );
            const signature = signTypedMessage(wallet.getPrivateKey(), { data });
            const { v, r, s } = fromRpcSig(signature);

            await expect(poolToken.permit(sender, spender.address, amount, deadline, v, r, s)).to.be.revertedWith(
                'ERC20Permit: expired deadline'
            );
        });
    });
});
